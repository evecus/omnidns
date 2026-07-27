//! Rule-based DNS router: hosts → ruleset rules → default upstream

use crate::config::{Config, IpStrategy};
use crate::dns::cache::DnsCache;
use crate::dns::hosts::{DynamicHosts, HostsTable};
use crate::dns::upstream::{HostResolver, UpstreamGroup};
use crate::ruleset::DrsFile;
use anyhow::{bail, Result};
use hickory_proto::op::{Message, MessageType, OpCode, ResponseCode};
use hickory_proto::rr::{Record, RecordType};
use indexmap::IndexMap;
use std::sync::Arc;
use tracing::{debug, info};

pub struct LoadedRule {
    pub ruleset: DrsFile,
    pub upstream: String,
}

pub struct Router {
    hosts: HostsTable,
    rules: Vec<LoadedRule>,
    upstreams: IndexMap<String, Arc<UpstreamGroup>>,
    cache: Option<Arc<DnsCache>>,
    strategy: IpStrategy,
    dynamic_hosts: Arc<DynamicHosts>,
}

impl Router {
    pub fn from_config(config: &Config, dynamic_hosts: Arc<DynamicHosts>) -> Result<Self> {
        // 构造 HostResolver（用 default_nameserver 解析上游域名）
        let resolver = HostResolver::new(config.default_nameserver.clone());

        // Build upstream groups
        let mut upstreams = IndexMap::new();
        for (name, group_cfg) in &config.groups {
            let servers = group_cfg
                .servers
                .iter()
                .map(|url| crate::dns::upstream::UpstreamServer::parse(url, group_cfg, resolver.clone()))
                .collect::<Result<Vec<_>>>()?;
            let group = UpstreamGroup::new(servers, group_cfg.strategy.clone());
            upstreams.insert(name.clone(), Arc::new(group));
        }

        // Load rulesets（每个 entry 是一个 (path, upstream) 对）
        let mut rules = Vec::new();
        for entry in &config.rulesets {
            let drs = DrsFile::load(&entry.path).map_err(|e| {
                anyhow::anyhow!("Failed to load ruleset {}: {}", entry.path.display(), e)
            })?;
            info!(
                "Loaded ruleset {} ({} domains, {} suffixes) → upstream {}",
                entry.path.display(),
                drs.domain_count,
                drs.suffix_count,
                entry.upstream
            );
            rules.push(LoadedRule {
                ruleset: drs,
                upstream: entry.upstream.clone(),
            });
        }

        let hosts = HostsTable::new(&config.hosts);

        let cache = if config.cache.enable {
            Some(Arc::new(DnsCache::new(
                config.cache.size,
                config.cache.min_ttl,
                config.cache.max_ttl,
            )))
        } else {
            None
        };

        let strategy = config.strategy.clone();
        if strategy != IpStrategy::Default {
            info!("IP strategy: {:?}", strategy);
        }

        Ok(Self { hosts, rules, upstreams, cache, strategy, dynamic_hosts })
    }

    pub async fn resolve(&self, request: &Message) -> Result<Message> {
        let query = match request.queries().first() {
            Some(q) => q,
            None => bail!("Empty DNS query"),
        };

        let name = query.name().to_string();
        let qtype = query.query_type();
        let id = request.id();

        debug!("Query: {} {:?}", name, qtype);

        // Apply IP strategy: intercept A/AAAA queries before any processing
        match self.strategy {
            IpStrategy::OnlyIpv4 if qtype == RecordType::AAAA => {
                debug!("Strategy only_ipv4: suppressing AAAA query for {}", name);
                return Ok(empty_noerror(request));
            }
            IpStrategy::OnlyIpv6 if qtype == RecordType::A => {
                debug!("Strategy only_ipv6: suppressing A query for {}", name);
                return Ok(empty_noerror(request));
            }
            _ => {}
        }

        // 1. Check cache
        if let Some(ref cache) = self.cache {
            if let Some(cached) = cache.get(&name, u16::from(qtype)) {
                debug!("Cache hit: {}", name);
                let mut resp = cached;
                resp.set_id(id);
                return Ok(resp);
            }
        }

        // 2. Check static hosts table
        if let Some(resp) = self.hosts.lookup(&name, qtype, id) {
            debug!("Static hosts hit: {}", name);
            return Ok(resp);
        }

        // 2b. Check dynamic hosts (DHCP leases)
        if let Some(resp) = self.dynamic_hosts.lookup(&name, qtype, id) {
            debug!("Dynamic hosts hit: {}", name);
            return Ok(resp);
        }

        // 3. Match rules（按顺序遍历 rulesets，首个命中生效）
        let domain = name.trim_end_matches('.').to_lowercase();
        for rule in &self.rules {
            if rule.ruleset.matches(&domain).is_some() {
                if let Some(upstream) = self.upstreams.get(&rule.upstream) {
                    debug!("Rule match: {} → upstream {}", name, rule.upstream);
                    let resp = self.query_with_strategy(upstream, request, &name, qtype).await?;
                    if let Some(ref cache) = self.cache {
                        cache.insert(&name, u16::from(qtype), &resp);
                    }
                    return Ok(resp);
                }
            }
        }

        // 4. Default upstream
        let default = self
            .upstreams
            .get("default")
            .ok_or_else(|| anyhow::anyhow!("No default upstream configured"))?;

        debug!("Default upstream: {}", name);
        let resp = self.query_with_strategy(default, request, &name, qtype).await?;
        if let Some(ref cache) = self.cache {
            cache.insert(&name, u16::from(qtype), &resp);
        }
        Ok(resp)
    }

    /// For prefer_ipv4/prefer_ipv6: send both A and AAAA in parallel,
    /// merge into a single response with preferred family sorted first.
    /// For all other strategies, forward the request as-is.
    async fn query_with_strategy(
        &self,
        upstream: &UpstreamGroup,
        request: &Message,
        _name: &str,
        qtype: RecordType,
    ) -> Result<Message> {
        match self.strategy {
            IpStrategy::PreferIpv4 if qtype == RecordType::A => {
                let alt = rewrite_qtype(request, RecordType::AAAA);
                let (a_resp, aaaa_resp) =
                    tokio::join!(upstream.query(request), upstream.query(&alt));
                Ok(merge_responses(request, a_resp?, aaaa_resp.ok(), true))
            }
            IpStrategy::PreferIpv4 if qtype == RecordType::AAAA => {
                let alt = rewrite_qtype(request, RecordType::A);
                let (a_resp, aaaa_resp) =
                    tokio::join!(upstream.query(&alt), upstream.query(request));
                Ok(merge_responses(request, aaaa_resp?, a_resp.ok(), false))
            }
            IpStrategy::PreferIpv6 if qtype == RecordType::AAAA => {
                let alt = rewrite_qtype(request, RecordType::A);
                let (aaaa_resp, a_resp) =
                    tokio::join!(upstream.query(request), upstream.query(&alt));
                Ok(merge_responses(request, aaaa_resp?, a_resp.ok(), true))
            }
            IpStrategy::PreferIpv6 if qtype == RecordType::A => {
                let alt = rewrite_qtype(request, RecordType::AAAA);
                let (aaaa_resp, a_resp) =
                    tokio::join!(upstream.query(&alt), upstream.query(request));
                Ok(merge_responses(request, a_resp?, aaaa_resp.ok(), false))
            }
            // Default / OnlyIpv4 / OnlyIpv6 / non-A/AAAA queries
            _ => upstream.query(request).await,
        }
    }
}

/// Build a new request with a different qtype (used for parallel prefer queries)
fn rewrite_qtype(original: &Message, new_type: RecordType) -> Message {
    let mut msg = original.clone();
    if let Some(q) = msg.queries_mut().first_mut() {
        q.set_query_type(new_type);
    }
    msg
}

/// Merge two responses: primary answers go first, secondary appended after.
/// `primary_first = true`  → primary records before secondary
/// `primary_first = false` → primary records only (secondary was the "extra" fetch)
fn merge_responses(
    request: &Message,
    mut primary: Message,
    secondary: Option<Message>,
    primary_first: bool,
) -> Message {
    primary.set_id(request.id());

    if let Some(sec) = secondary {
        if primary_first {
            // Append secondary answers after primary
            for record in sec.answers() {
                primary.add_answer(record.clone());
            }
        } else {
            // Prepend secondary answers before primary
            let original_answers: Vec<Record> = primary.answers().to_vec();
            let sec_answers: Vec<Record> = sec.answers().to_vec();
            // Rebuild answer section: secondary first, then original
            primary.take_answers();
            for r in sec_answers {
                primary.add_answer(r);
            }
            for r in original_answers {
                primary.add_answer(r);
            }
        }
    }

    primary
}

fn empty_noerror(request: &Message) -> Message {
    let mut resp = Message::new();
    resp.set_id(request.id());
    resp.set_message_type(MessageType::Response);
    resp.set_op_code(OpCode::Query);
    resp.set_recursion_desired(true);
    resp.set_recursion_available(true);
    resp.set_response_code(ResponseCode::NoError);
    for q in request.queries() {
        resp.add_query(q.clone());
    }
    resp
}
