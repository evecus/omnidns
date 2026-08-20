pub mod ra;
pub mod v4;
pub mod v6;

use crate::config::DhcpConfig;
use crate::dns::hosts::DynamicHosts;
use anyhow::Result;
use std::sync::Arc;
use tracing::info;

/// Start all enabled DHCP/RA services.
///
/// If no DHCP/RA service is enabled in the config, this future parks
/// forever instead of returning immediately. Otherwise the caller
/// (run.rs) uses `tokio::select!` on this future and would tear down
/// the whole process the moment it completes — an empty config must
/// not be able to kill the DNS server.
pub async fn serve(config: DhcpConfig, dynamic_hosts: Arc<DynamicHosts>) -> Result<()> {
    let mut handles = Vec::new();

    if config.v4.as_ref().map(|c| c.enable).unwrap_or(false) {
        let cfg = config.v4.clone().unwrap();
        let hosts = dynamic_hosts.clone();
        info!("Starting DHCPv4 on interface {}", cfg.interface);
        handles.push(tokio::spawn(async move {
            if let Err(e) = v4::server::serve(cfg, hosts).await {
                tracing::error!("DHCPv4 server error: {}", e);
            }
        }));
    }

    if config.v6.as_ref().map(|c| c.enable).unwrap_or(false) {
        let cfg = config.v6.clone().unwrap();
        let hosts = dynamic_hosts.clone();
        info!("Starting DHCPv6 on interface {}", cfg.interface);
        handles.push(tokio::spawn(async move {
            if let Err(e) = v6::server::serve(cfg, hosts).await {
                tracing::error!("DHCPv6 server error: {}", e);
            }
        }));
    }

    if config.ra.as_ref().map(|c| c.enable).unwrap_or(false) {
        let cfg = config.ra.clone().unwrap();
        info!("Starting RA daemon on interface {}", cfg.interface);
        handles.push(tokio::spawn(async move {
            if let Err(e) = ra::sender::serve(cfg).await {
                tracing::error!("RA daemon error: {}", e);
            }
        }));
    }

    if handles.is_empty() {
        // Nothing to do. Park forever so the caller's tokio::select!
        // only fires on shutdown signal or DNS server exit, not on
        // an empty DHCP config.
        info!("No DHCP/RA services enabled — parking");
        std::future::pending::<()>().await;
    } else {
        futures::future::join_all(handles).await;
    }
    Ok(())
}

/// 持有 v4/v6/RA 子任务句柄，支持精确 abort（用于运行时热更新场景，见
/// [`crate::runtime::RuntimeHandle`]）。与 [`serve`] 的区别同
/// [`crate::dns::AbortableDnsListener`] 之于 [`crate::dns::serve`]：
/// 后者把子任务包进一个 `join_all` future 返回，abort 外层并不会连带 abort
/// 内部任务，会导致旧的 raw socket / 网卡监听持续占用。
pub struct AbortableDhcpServices {
    handles: Vec<tokio::task::JoinHandle<()>>,
}

impl AbortableDhcpServices {
    pub fn abort(&self) {
        for h in &self.handles {
            h.abort();
        }
    }
}

/// 启动 v4/v6/RA（按配置启用与否），返回可统一 abort 的句柄集合。
/// 若配置中三者都未启用，返回一个空句柄集合（abort() 是 no-op）。
pub async fn serve_abortable(
    config: DhcpConfig,
    dynamic_hosts: Arc<DynamicHosts>,
) -> AbortableDhcpServices {
    let mut handles = Vec::new();

    if config.v4.as_ref().map(|c| c.enable).unwrap_or(false) {
        let cfg = config.v4.clone().unwrap();
        let hosts = dynamic_hosts.clone();
        info!("Starting DHCPv4 on interface {}", cfg.interface);
        handles.push(tokio::spawn(async move {
            if let Err(e) = v4::server::serve(cfg, hosts).await {
                tracing::error!("DHCPv4 server error: {}", e);
            }
        }));
    }

    if config.v6.as_ref().map(|c| c.enable).unwrap_or(false) {
        let cfg = config.v6.clone().unwrap();
        let hosts = dynamic_hosts.clone();
        info!("Starting DHCPv6 on interface {}", cfg.interface);
        handles.push(tokio::spawn(async move {
            if let Err(e) = v6::server::serve(cfg, hosts).await {
                tracing::error!("DHCPv6 server error: {}", e);
            }
        }));
    }

    if config.ra.as_ref().map(|c| c.enable).unwrap_or(false) {
        let cfg = config.ra.clone().unwrap();
        info!("Starting RA daemon on interface {}", cfg.interface);
        handles.push(tokio::spawn(async move {
            if let Err(e) = ra::sender::serve(cfg).await {
                tracing::error!("RA daemon error: {}", e);
            }
        }));
    }

    if handles.is_empty() {
        info!("No DHCP/RA services enabled");
    }

    AbortableDhcpServices { handles }
}

