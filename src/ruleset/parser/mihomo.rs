//! Parse mihomo YAML rule payload
//! Supports:
//!   - a.com          → DOMAIN
//!   - +.a.com        → DOMAIN-SUFFIX
//!   - DOMAIN,a.com   → DOMAIN (alternate syntax)
//!   - DOMAIN-SUFFIX,a.com → DOMAIN-SUFFIX (alternate syntax)

use super::{EntryType, RuleEntry};
use anyhow::{Context, Result};
use tracing::warn;

pub fn parse(input: &str) -> Result<Vec<RuleEntry>> {
    let doc: serde_yaml::Value =
        serde_yaml::from_str(input).context("Failed to parse YAML")?;

    let payload = doc
        .get("payload")
        .and_then(|v| v.as_sequence())
        .context("Missing or invalid 'payload' list in YAML")?;

    let mut entries = Vec::new();
    for item in payload {
        let s = match item.as_str() {
            Some(s) => s.trim(),
            None => {
                warn!("Skipping non-string YAML payload item");
                continue;
            }
        };

        if s.is_empty() {
            continue;
        }

        if let Some(entry) = parse_line(s) {
            entries.push(entry);
        } else {
            warn!("Skipping unsupported mihomo rule: {}", s);
        }
    }

    Ok(entries)
}

fn parse_line(s: &str) -> Option<RuleEntry> {
    // Alternate syntax: "DOMAIN,a.com" or "DOMAIN-SUFFIX,a.com"
    if let Some(rest) = s.strip_prefix("DOMAIN-SUFFIX,") {
        let domain = rest.trim().to_lowercase();
        if is_valid_domain(&domain) {
            return Some(RuleEntry { domain, rule_type: EntryType::DomainSuffix });
        }
        return None;
    }
    if let Some(rest) = s.strip_prefix("DOMAIN,") {
        let domain = rest.trim().to_lowercase();
        if is_valid_domain(&domain) {
            return Some(RuleEntry { domain, rule_type: EntryType::Domain });
        }
        return None;
    }

    // Skip other typed rules (IP-CIDR, GEOIP, etc.)
    if s.contains(',') {
        return None;
    }

    // Simple syntax: "+.a.com" or "a.com"
    if let Some(rest) = s.strip_prefix("+.") {
        let domain = rest.trim().to_lowercase();
        if is_valid_domain(&domain) {
            return Some(RuleEntry { domain, rule_type: EntryType::DomainSuffix });
        }
        return None;
    }

    let domain = s.to_lowercase();
    if is_valid_domain(&domain) {
        Some(RuleEntry { domain, rule_type: EntryType::Domain })
    } else {
        None
    }
}

fn is_valid_domain(s: &str) -> bool {
    if s.is_empty() || s.len() > 253 {
        return false;
    }
    s.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_mihomo() {
        let yaml = r#"
payload:
  - google.com
  - '+.youtube.com'
  - DOMAIN,example.com
  - DOMAIN-SUFFIX,github.com
  - IP-CIDR,1.1.1.0/24
"#;
        let entries = parse(yaml).unwrap();
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0], RuleEntry { domain: "google.com".into(), rule_type: EntryType::Domain });
        assert_eq!(entries[1], RuleEntry { domain: "youtube.com".into(), rule_type: EntryType::DomainSuffix });
        assert_eq!(entries[2], RuleEntry { domain: "example.com".into(), rule_type: EntryType::Domain });
        assert_eq!(entries[3], RuleEntry { domain: "github.com".into(), rule_type: EntryType::DomainSuffix });
    }
}
