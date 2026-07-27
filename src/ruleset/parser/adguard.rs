//! Parse AdGuard filter list format
//! Supports:
//!   ||domain.com^          → DOMAIN-SUFFIX
//!   ||domain.com^|         → DOMAIN-SUFFIX
//!   @@||domain.com^        → whitelist, IGNORED
//!   ! comment              → skipped
//!   # comment              → skipped
//!   /regex/                → skipped with warning

use super::{EntryType, RuleEntry};
use tracing::warn;

pub fn parse(input: &str) -> Vec<RuleEntry> {
    let mut entries = Vec::new();

    for line in input.lines() {
        let line = line.trim();

        // Skip empty lines and comments
        if line.is_empty() || line.starts_with('!') || line.starts_with('#') {
            continue;
        }

        // Skip whitelist entries
        if line.starts_with("@@") {
            continue;
        }

        // Skip regex rules
        if line.starts_with('/') {
            warn!("Skipping regex AdGuard rule: {}", line);
            continue;
        }

        if let Some(entry) = parse_line(line) {
            entries.push(entry);
        } else {
            warn!("Skipping unsupported AdGuard rule: {}", line);
        }
    }

    entries
}

fn parse_line(line: &str) -> Option<RuleEntry> {
    // Must start with ||
    let rest = line.strip_prefix("||")?;

    // Strip trailing anchors: ^, ^|, ^$..., |
    let domain = rest
        .split('^')
        .next()?
        .trim_end_matches('|')
        .trim();

    if domain.is_empty() {
        return None;
    }

    // Skip if it has path components or wildcards within
    if domain.contains('/') || domain.contains('*') {
        return None;
    }

    let domain = domain.to_lowercase();

    // Validate
    if !domain.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-') {
        return None;
    }

    // ||domain.com^ means "block domain.com and all subdomains" → DOMAIN-SUFFIX
    Some(RuleEntry {
        domain,
        rule_type: EntryType::DomainSuffix,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_adguard() {
        let txt = r#"
! AdGuard filter
# another comment
||ads.example.com^
||tracker.net^|
@@||whitelist.com^
/regex-rule/
||bad*.com^
||google.com^$important
"#;
        let entries = parse(txt);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].domain, "ads.example.com");
        assert_eq!(entries[0].rule_type, EntryType::DomainSuffix);
        assert_eq!(entries[1].domain, "tracker.net");
        assert_eq!(entries[2].domain, "google.com");
    }
}
