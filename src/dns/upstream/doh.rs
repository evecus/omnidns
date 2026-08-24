//! DNS-over-HTTPS upstream。
//!
//! DoH 用 reqwest::Client，通过 `dns_resolver` 配置 HostResolver，让
//! reqwest 解析 DoH URL 中的域名时用 default_nameserver，而非系统
//! resolver（避免循环依赖）。
//!
//! 每个 DoH 上游一个 DohClient（持有独立的 reqwest::Client），首次
//! 查询时 lazy 构建并缓存。
//!
//! ## 连接自愈
//!
//! 对齐 sing-box `https.go`：reqwest::Client 内部的连接池长期存活，若某条
//! HTTP/2 连接被中间设备"黑洞"（丢包但不 RST/FIN），后续请求会反复超时，
//! 但连接池不会自动感知并淘汰这条连接。旧实现里 `DohClient` 一旦建好就
//! 全进程复用，没有任何自愈手段。
//!
//! 现在：查询超时（`DOH_TIMEOUT` 触发）时，上层 `UpstreamServer::query`
//! 会调用 `DohClient::recycle`，关闭空闲连接并重建一个新的 reqwest::Client，
//! 后续查询走新连接，避免卡死在同一条坏连接上。为避免短时间内并发多次
//! 重建，重建有节流（`RESET_COOLDOWN`）。

use anyhow::{Context, Result};
use hickory_proto::op::Message;
use hickory_proto::serialize::binary::BinDecodable;
use reqwest::Client;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::debug;

use super::resolver::HostResolver;

const DOH_TIMEOUT: Duration = Duration::from_secs(5);
const DOH_MEDIA_TYPE: &str = "application/dns-message";
/// 重建 reqwest::Client 的最小间隔，避免并发超时时重复重建。
const RESET_COOLDOWN: Duration = Duration::from_secs(2);

/// DoH 客户端：持有 reqwest::Client（内置 H2 连接池 + 自定义 DNS resolver）。
///
/// `client` 用 `RwLock` 包裹以支持超时后原地替换（自愈），`insecure` 和
/// `resolver` 保留用于重建时复用同样的配置。
pub struct DohClient {
    client: RwLock<Client>,
    insecure: bool,
    resolver: HostResolver,
    /// 最近一次重建的时间，配合 RESET_COOLDOWN 节流。
    last_reset: RwLock<Option<Instant>>,
}

impl DohClient {
    pub async fn new(_url: &str, insecure: bool, resolver: HostResolver) -> Result<Self> {
        let client = build_client(insecure, resolver.clone())?;
        Ok(Self {
            client: RwLock::new(client),
            insecure,
            resolver,
            last_reset: RwLock::new(None),
        })
    }

    /// 查询超时后调用：关闭空闲连接并重建一个新的 reqwest::Client。
    /// 节流窗口内的重复调用会被跳过（大概率是同一批并发查询都超时了，
    /// 没必要重建多次）。
    pub async fn recycle(&self) {
        {
            let last = self.last_reset.read().await;
            if let Some(t) = *last {
                if t.elapsed() < RESET_COOLDOWN {
                    return;
                }
            }
        }
        let mut last = self.last_reset.write().await;
        if let Some(t) = *last {
            if t.elapsed() < RESET_COOLDOWN {
                return; // 双重检查：等锁期间可能已被别的任务重建过
            }
        }
        match build_client(self.insecure, self.resolver.clone()) {
            Ok(new_client) => {
                let mut guard = self.client.write().await;
                *guard = new_client;
                *last = Some(Instant::now());
                debug!("DoH client recycled after timeout");
            }
            Err(e) => {
                tracing::warn!("Failed to recycle DoH client: {}", e);
            }
        }
    }
}

fn build_client(insecure: bool, resolver: HostResolver) -> Result<Client> {
    let mut builder = Client::builder()
        .timeout(DOH_TIMEOUT)
        .connect_timeout(DOH_TIMEOUT)
        .pool_max_idle_per_host(4)
        .https_only(true)
        // 关键：用 HostResolver 解析域名，绕过系统 resolver（避免循环依赖）
        .dns_resolver(Arc::new(resolver));

    if insecure {
        builder = builder.danger_accept_invalid_certs(true);
    }

    builder.build().context("Failed to build reqwest Client for DoH")
}

pub async fn query(client: Arc<DohClient>, url: &str, request: &Message) -> Result<Message> {
    let original_id = request.id();

    // RFC 8484 §4.2: 请求 message ID 应为 0
    let mut req_to_send = request.clone();
    req_to_send.set_id(0);
    let wire = req_to_send.to_vec()?;

    // 严格 URL 解析，缺路径补 /dns-query
    let doh_url = normalize_doh_url(url)?;

    let http_client = client.client.read().await.clone();
    let send_result = http_client
        .post(doh_url.as_str())
        .header(reqwest::header::CONTENT_TYPE, DOH_MEDIA_TYPE)
        .header(reqwest::header::ACCEPT, DOH_MEDIA_TYPE)
        .body(wire)
        .send()
        .await;

    let resp = match send_result {
        Ok(resp) => resp,
        Err(e) => {
            // 超时（或底层连接错误）大概率意味着连接池里有条坏连接，
            // 触发自愈重建，避免后续查询继续卡在同一条连接上。
            if e.is_timeout() || e.is_connect() {
                client.recycle().await;
            }
            return Err(e).context("DoH POST failed");
        }
    };

    // RFC 8484 §4.2.1: 严格 200
    let status = resp.status();
    if status != reqwest::StatusCode::OK {
        anyhow::bail!("DoH {} returned non-200 status: {}", url, status);
    }

    let bytes = resp.bytes().await.context("DoH response body read failed")?;
    if bytes.is_empty() {
        anyhow::bail!("DoH {} returned empty body", url);
    }

    let mut msg = Message::from_bytes(&bytes).context("Failed to parse DoH DNS response")?;
    // 恢复原始 queryId
    msg.set_id(original_id);

    debug!(
        "DoH query to {} succeeded, original_id={}, answers={}",
        url,
        original_id,
        msg.answer_count()
    );

    Ok(msg)
}

/// 严格解析 DoH URL，缺路径时补 `/dns-query`。
fn normalize_doh_url(url: &str) -> Result<String> {
    let mut parsed = url::Url::parse(url)
        .map_err(|e| anyhow::anyhow!("invalid DoH URL {}: {}", url, e))?;

    if parsed.path() == "/" || parsed.path().is_empty() {
        parsed.set_path("/dns-query");
    }

    Ok(parsed.to_string())
}
