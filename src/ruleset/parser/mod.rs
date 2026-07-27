pub mod adguard;
pub mod mihomo;

/// A parsed rule entry
#[derive(Debug, Clone, PartialEq)]
pub struct RuleEntry {
    pub domain: String,
    pub rule_type: EntryType,
}

#[derive(Debug, Clone, PartialEq)]
pub enum EntryType {
    Domain,
    DomainSuffix,
}
