//! Web API 端点。
//!
//! 路由：
//!   POST /api/auth/login     登录，成功返回 Set-Cookie
//!   POST /api/auth/logout    登出
//!   POST /api/auth/password  改密码（需已登录）
//!   GET  /api/config         当前结构化配置（password-hash 脱敏）
//!   PUT  /api/config         提交新配置 → 校验/落盘/热更新
//!   GET  /api/stats          总览计数器
//!   GET  /api/upstreams      上游延迟/成功率
//!   GET  /api/rules          规则命中排行
//!   GET  /api/clients        客户端 Top N
//!   GET  /api/querylog       查询日志（?limit=&domain=&client=）
//!   GET  /api/dashboard      一次返回全部门面数据
//!   GET  /metrics            Prometheus 文本格式

use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use bcrypt::hash as bcrypt_hash;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::config::Config;
use crate::runtime::RuntimeHandle;
use crate::stats::{QueryEntry, StatsCollector, StatsSnapshot, UpstreamStat};
use crate::web::auth::{self, AuthState};

/// API 共享状态。
#[derive(Clone)]
pub struct ApiState {
    pub stats: Arc<StatsCollector>,
    pub persistence: Option<Arc<crate::stats::persistence::StatsPersistence>>,
    pub runtime: Arc<RuntimeHandle>,
    pub auth: AuthState,
}

#[derive(Debug, Deserialize)]
pub struct QueryLogParams {
    #[serde(default = "default_limit")]
    pub limit: usize,
    pub domain: Option<String>,
    pub client: Option<String>,
    /// 是否从 SQLite 查询历史（默认只查内存 ring buffer）。
    #[serde(default)]
    pub history: bool,
}

fn default_limit() -> usize {
    100
}

#[derive(Debug, Deserialize)]
pub struct ClientsParams {
    #[serde(default = "default_clients_limit")]
    pub limit: usize,
}

fn default_clients_limit() -> usize {
    20
}

#[derive(Debug, Serialize)]
pub struct DashboardResponse {
    pub stats: StatsSnapshot,
    pub upstreams: Vec<(String, UpstreamStat)>,
    pub rules: Vec<(String, u64)>,
    pub clients: Vec<(String, u64)>,
    pub recent_queries: Vec<QueryEntry>,
}

// ============================================================
// 鉴权
// ============================================================

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub ok: bool,
}

/// POST /api/auth/login
pub async fn auth_login(
    State(state): State<ApiState>,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    if !state.auth.is_enabled() {
        // 未启用鉴权：直接放行，不下发 cookie（前端也不会再要求登录）。
        return (StatusCode::OK, Json(LoginResponse { ok: true })).into_response();
    }

    match state.auth.login(&req.username, &req.password) {
        Some(token) => {
            let mut headers = HeaderMap::new();
            headers.insert(
                header::SET_COOKIE,
                auth::session_cookie_header(&token).parse().unwrap(),
            );
            (headers, Json(LoginResponse { ok: true })).into_response()
        }
        None => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"ok": false, "error": "用户名或密码错误"})),
        )
            .into_response(),
    }
}

/// POST /api/auth/logout
pub async fn auth_logout(State(state): State<ApiState>, headers: HeaderMap) -> impl IntoResponse {
    if let Some(cookie) = headers.get(header::COOKIE).and_then(|h| h.to_str().ok()) {
        for part in cookie.split(';') {
            let part = part.trim();
            if let Some(token) = part.strip_prefix(&format!("{}=", auth::SESSION_COOKIE_NAME)) {
                state.auth.logout(token);
            }
        }
    }
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        auth::clear_session_cookie_header().parse().unwrap(),
    );
    (headers, StatusCode::OK)
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: String,
    pub new_password: String,
}

/// POST /api/auth/password  （需已登录）
/// 改密码：校验旧密码 → bcrypt 新密码 → 更新内存中的 auth 状态（登录校验立即生效）
/// → 更新磁盘配置文件（仅 web.auth 字段，不走 RuntimeHandle::apply 的常规热更新路径，
/// 因为那条路径本来就会把 web.auth 强制锁回旧值）。
pub async fn auth_change_password(
    State(state): State<ApiState>,
    Json(req): Json<ChangePasswordRequest>,
) -> impl IntoResponse {
    let current = state.runtime.current_config();
    let auth_cfg = &current.web.auth;

    if auth_cfg.enable {
        let ok = bcrypt::verify(&req.old_password, &auth_cfg.password_hash).unwrap_or(false);
        if !ok {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "原密码不正确"})),
            )
                .into_response();
        }
    }

    if req.new_password.len() < 8 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "新密码至少 8 位"})),
        )
            .into_response();
    }

    let new_hash = match bcrypt_hash(&req.new_password, 10) {
        Ok(h) => h,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("生成密码哈希失败: {}", e)})),
            )
                .into_response()
        }
    };

    // 1. 更新内存中的鉴权状态（立即生效，不需要重启，也不受 apply() 的只读限制约束，
    //    因为这里走的是专门通道）。
    let mut new_auth_cfg = auth_cfg.clone();
    new_auth_cfg.password_hash = new_hash.clone();
    state.auth.config.store(Arc::new(new_auth_cfg.clone()));

    // 2. 落盘：直接构造一份新 Config（仅改 web.auth.password_hash），写文件。
    //    不经过 RuntimeHandle::apply，因为 apply 会拒绝 web.auth 的改动；这里
    //    改用 runtime.config 的 ArcSwap 直接更新内存快照 + 单独保存到磁盘。
    let mut new_config: Config = (*current).clone();
    new_config.web.auth.password_hash = new_hash;
    if let Err(e) = new_config.save_to(&state.runtime.config_path) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("密码已更新但写入配置文件失败: {}", e)})),
        )
            .into_response();
    }
    state.runtime.config.store(Arc::new(new_config));

    (StatusCode::OK, Json(serde_json::json!({"ok": true}))).into_response()
}

// ============================================================
// 配置读写
// ============================================================

/// GET /api/config
pub async fn get_config(State(state): State<ApiState>) -> impl IntoResponse {
    let config = state.runtime.current_config();
    let mut value = match serde_json::to_value(&*config) {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("序列化配置失败: {}", e)})),
            )
                .into_response()
        }
    };
    // 脱敏：password-hash 不下发明文哈希，只告诉前端"是否已设置"
    if let Some(web) = value.get_mut("web") {
        if let Some(auth) = web.get_mut("auth") {
            let has_password = auth
                .get("password-hash")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false);
            if let Some(obj) = auth.as_object_mut() {
                obj.remove("password-hash");
                obj.insert("password-set".to_string(), serde_json::json!(has_password));
            }
        }
    }
    (StatusCode::OK, Json(value)).into_response()
}

/// PUT /api/config
/// body 是完整的结构化配置 JSON（与 GET /api/config 同形状，但 web.auth 的
/// username/password-hash 即使传了也会被后端忽略——见 RuntimeHandle::apply）。
pub async fn put_config(
    State(state): State<ApiState>,
    Json(mut body): Json<serde_json::Value>,
) -> impl IntoResponse {
    // 前端可能沿用 GET 返回的形状（带 password-set 而非 password-hash），
    // 这里补回当前的 password-hash / username，交给 apply() 里的只读锁再兜底一次。
    let current = state.runtime.current_config();
    if let Some(web) = body.get_mut("web") {
        if let Some(auth) = web.get_mut("auth") {
            if let Some(obj) = auth.as_object_mut() {
                obj.remove("password-set");
                obj.insert(
                    "password-hash".to_string(),
                    serde_json::json!(current.web.auth.password_hash),
                );
                if !obj.contains_key("username") {
                    obj.insert(
                        "username".to_string(),
                        serde_json::json!(current.web.auth.username),
                    );
                }
            }
        }
        if let Some(obj) = web.as_object_mut() {
            // listen 同样强制沿用旧值，避免反序列化到一个不存在/非法的地址时报错；
            // apply() 里也会再锁一次，这里只是让 JSON 结构本身合法。
            if !obj.contains_key("listen") {
                obj.insert(
                    "listen".to_string(),
                    serde_json::json!(current.web.listen.to_string()),
                );
            }
        }
    }

    let new_config: Config = match serde_json::from_value(body) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": format!("配置格式错误: {}", e)})),
            )
                .into_response()
        }
    };

    match state.runtime.apply(new_config).await {
        Ok(report) => (StatusCode::OK, Json(report)).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ============================================================
// 统计 / 查询日志（不变）
// ============================================================

/// GET /api/stats
pub async fn stats(State(state): State<ApiState>) -> impl IntoResponse {
    Json(state.stats.snapshot_stats())
}

/// GET /api/upstreams
pub async fn upstreams(State(state): State<ApiState>) -> impl IntoResponse {
    Json(state.stats.snapshot_upstreams())
}

/// GET /api/rules
pub async fn rules(State(state): State<ApiState>) -> impl IntoResponse {
    Json(state.stats.snapshot_rules())
}

/// GET /api/clients?limit=20
pub async fn clients(
    State(state): State<ApiState>,
    Query(params): Query<ClientsParams>,
) -> impl IntoResponse {
    let rows = state.stats.snapshot_clients(params.limit);
    let out: Vec<(String, u64)> = rows.into_iter().map(|(ip, n)| (ip.to_string(), n)).collect();
    Json(out)
}

/// GET /api/querylog?limit=100&domain=&client=&history=false
pub async fn querylog(
    State(state): State<ApiState>,
    Query(params): Query<QueryLogParams>,
) -> impl IntoResponse {
    if params.history {
        match &state.persistence {
            Some(p) => match p.query_log(params.limit, params.domain.as_deref(), params.client.as_deref()) {
                Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": e.to_string()})),
                )
                    .into_response(),
            },
            None => (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "persistence not configured"})),
            )
                .into_response(),
        }
    } else {
        let rows = state.stats.snapshot_query_log(params.limit);
        (StatusCode::OK, Json(rows)).into_response()
    }
}

/// GET /api/dashboard
pub async fn dashboard(State(state): State<ApiState>) -> impl IntoResponse {
    let stats = state.stats.snapshot_stats();
    let upstreams = state.stats.snapshot_upstreams();
    let rules = state.stats.snapshot_rules();
    let clients_raw = state.stats.snapshot_clients(20);
    let clients: Vec<(String, u64)> = clients_raw
        .into_iter()
        .map(|(ip, n)| (ip.to_string(), n))
        .collect();
    let recent_queries = state.stats.snapshot_query_log(50);

    Json(DashboardResponse {
        stats,
        upstreams,
        rules,
        clients,
        recent_queries,
    })
}

/// GET /metrics  (Prometheus 文本格式)
pub async fn metrics(State(state): State<ApiState>) -> impl IntoResponse {
    let snap = state.stats.snapshot_stats();
    let mut out = String::new();

    out.push_str("# HELP relay_queries_total Total DNS queries received.\n");
    out.push_str("# TYPE relay_queries_total counter\n");
    out.push_str(&format!("relay_queries_total {}\n", snap.total_queries));

    out.push_str("# HELP relay_blocked_total Total blocked queries.\n");
    out.push_str("# TYPE relay_blocked_total counter\n");
    out.push_str(&format!("relay_blocked_total {}\n", snap.total_blocked));

    out.push_str("# HELP relay_failed_total Total failed queries.\n");
    out.push_str("# TYPE relay_failed_total counter\n");
    out.push_str(&format!("relay_failed_total {}\n", snap.total_failed));

    out.push_str("# HELP relay_cache_hits_total Total cache hits.\n");
    out.push_str("# TYPE relay_cache_hits_total counter\n");
    out.push_str(&format!("relay_cache_hits_total {}\n", snap.cache_hits));

    out.push_str("# HELP relay_latency_ms_avg Average query latency in ms (EMA).\n");
    out.push_str("# TYPE relay_latency_ms_avg gauge\n");
    out.push_str(&format!("relay_latency_ms_avg {}\n", snap.avg_latency_ms));

    out.push_str("# HELP relay_by_rcode Queries by response code.\n");
    out.push_str("# TYPE relay_by_rcode counter\n");
    for (rcode, n) in &snap.by_rcode {
        out.push_str(&format!("relay_by_rcode{{rcode=\"{}\"}} {}\n", rcode, n));
    }

    out.push_str("# HELP relay_by_qtype Queries by query type.\n");
    out.push_str("# TYPE relay_by_qtype counter\n");
    for (qtype, n) in &snap.by_type {
        out.push_str(&format!("relay_by_qtype{{qtype=\"{}\"}} {}\n", qtype, n));
    }

    out.push_str("# HELP relay_upstream_queries Total queries per upstream.\n");
    out.push_str("# TYPE relay_upstream_queries counter\n");
    out.push_str("# HELP relay_upstream_latency_ms_avg Average latency per upstream (EMA, ms).\n");
    out.push_str("# TYPE relay_upstream_latency_ms_avg gauge\n");
    for (name, s) in state.stats.snapshot_upstreams() {
        out.push_str(&format!(
            "relay_upstream_queries{{upstream=\"{}\"}} {}\n",
            name, s.queries
        ));
        out.push_str(&format!(
            "relay_upstream_success{{upstream=\"{}\"}} {}\n",
            name, s.success
        ));
        out.push_str(&format!(
            "relay_upstream_failed{{upstream=\"{}\"}} {}\n",
            name, s.failed
        ));
        out.push_str(&format!(
            "relay_upstream_latency_ms_avg{{upstream=\"{}\"}} {}\n",
            name, s.latency_ema_ms
        ));
    }

    out.push_str("# HELP relay_rule_hits Total matches per rule.\n");
    out.push_str("# TYPE relay_rule_hits counter\n");
    for (rule, n) in state.stats.snapshot_rules() {
        out.push_str(&format!("relay_rule_hits{{rule=\"{}\"}} {}\n", rule, n));
    }

    (
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        out,
    )
}
