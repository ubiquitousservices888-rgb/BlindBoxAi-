// Original offline BlindBoxAI diagnostic. No upstream application code is included.
#include <charconv>
#include <cstdint>
#include <iostream>
#include <map>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <tuple>
#include <vector>

namespace {
constexpr std::uint64_t max_amount = 9007199254740900ULL;
constexpr std::uint64_t max_total = 9007199254740991ULL;
using Key = std::pair<std::string, std::string>;

std::vector<std::string> fields(const std::string& line) {
  std::vector<std::string> result;
  std::size_t start = 0;
  for (;;) {
    const auto end = line.find('\t', start);
    result.push_back(line.substr(start, end == std::string::npos ? end : end - start));
    if (end == std::string::npos) return result;
    start = end + 1;
  }
}

std::optional<std::uint64_t> integer(const std::string& text, std::uint64_t maximum) {
  if (text.empty() || (text.size() > 1 && text[0] == '0')) return std::nullopt;
  for (const auto c : text) if (c < '0' || c > '9') return std::nullopt;
  std::uint64_t result = 0;
  const auto parsed = std::from_chars(text.data(), text.data() + text.size(), result);
  if (parsed.ec != std::errc{} || parsed.ptr != text.data() + text.size() || result > maximum) {
    return std::nullopt;
  }
  return result;
}

bool hex(const std::string& text, bool empty = false) {
  if ((!empty && text.empty()) || text.size() > 1024 || text.size() % 2 != 0) return false;
  for (const auto c : text) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
  return true;
}

struct Conversion {
  std::vector<std::uint64_t> rows;
  std::set<std::string> reasons;
  std::set<std::tuple<std::string, std::string, std::string, std::string>> observations;
  std::optional<std::uint64_t> amount;
  std::optional<std::string> custom_id;
};

struct Receipt {
  std::set<std::string> post_ids;
  std::set<std::string> urls;
};

void run() {
  std::map<Key, Conversion> conversions;
  std::map<Key, Receipt> receipts;
  std::uint64_t lines = 0;
  std::uint64_t duplicate_rows = 0;
  std::string line;
  while (std::getline(std::cin, line)) {
    if (++lines > 20000 || line.size() > 8192) throw std::runtime_error("input_limit");
    const auto f = fields(line);
    if (f.size() < 2) throw std::runtime_error("invalid_protocol");
    const auto row = integer(f[1], 9999);
    if (!row) throw std::runtime_error("invalid_row");
    if (f[0] == "E") {
      if (f.size() != 8 || !hex(f[2]) || !hex(f[3]) || !hex(f[5], true) ||
          (f[4] != "C" && f[4] != "B") || (f[6] != "USD" && f[6] != "OTHER")) {
        throw std::runtime_error("invalid_conversion_protocol");
      }
      auto& group = conversions[{f[2], f[3]}];
      group.rows.push_back(*row);
      if (!group.observations.insert({f[4], f[5], f[6], f[7]}).second) ++duplicate_rows;
      if (f[4] != "C") group.reasons.insert("unconfirmed_or_malformed_observation");
      if (f[6] != "USD") group.reasons.insert("non_usd_currency");
      const auto amount = integer(f[7], max_amount);
      if (!amount) group.reasons.insert("invalid_amount");
      else if (group.amount && group.amount != amount) group.reasons.insert("conflicting_amount");
      else group.amount = amount;
      if (group.custom_id && *group.custom_id != f[5]) group.reasons.insert("conflicting_attribution");
      else group.custom_id = f[5];
    } else if (f[0] == "R") {
      if (f.size() != 6 || !hex(f[2]) || !hex(f[3]) || !hex(f[4], true) || !hex(f[5], true)) {
        throw std::runtime_error("invalid_receipt_protocol");
      }
      auto& group = receipts[{f[2], f[3]}];
      group.post_ids.insert(f[4]);
      group.urls.insert(f[5]);
    } else throw std::runtime_error("unknown_record_type");
  }
  if (!std::cin.eof()) throw std::runtime_error("input_read_failed");

  std::uint64_t consistent = 0, quarantined = 0, unattributed = 0, total = 0;
  bool overflow = false;
  for (const auto& [key, group] : conversions) {
    (void)key;
    if (!group.reasons.empty()) { ++quarantined; continue; }
    ++consistent;
    if (group.custom_id->empty()) ++unattributed;
    if (*group.amount > max_total - total) overflow = true;
    else if (!overflow) total += *group.amount;
  }
  std::uint64_t stored_ids = 0, stored_urls = 0, awaiting = 0, receipt_conflicts = 0;
  for (const auto& [key, receipt] : receipts) {
    (void)key;
    const bool has_id = receipt.post_ids.size() == 1 && !receipt.post_ids.begin()->empty();
    const bool has_url = receipt.urls.size() == 1 && !receipt.urls.begin()->empty();
    const bool conflict = receipt.post_ids.size() != 1 || receipt.urls.size() != 1;
    if (has_id) ++stored_ids;
    if (has_url) ++stored_urls;
    if (conflict) ++receipt_conflicts;
    if (!has_id || !has_url || conflict) ++awaiting;
  }
  std::cout << "{\"conversionIdentities\":" << conversions.size()
            << ",\"consistentIdentities\":" << consistent
            << ",\"quarantinedIdentities\":" << quarantined
            << ",\"duplicateObservations\":" << duplicate_rows
            << ",\"unattributedConsistentIdentities\":" << unattributed
            << ",\"consistentReportedAmountCents\":";
  if (overflow) std::cout << "null";
  else std::cout << '"' << total << '"';
  std::cout << ",\"totalOverflow\":" << (overflow ? "true" : "false")
            << ",\"receiptIdentities\":" << receipts.size()
            << ",\"storedProviderPostIds\":" << stored_ids
            << ",\"storedPublicUrlCandidates\":" << stored_urls
            << ",\"receiptsNeedingReconciliation\":" << awaiting
            << ",\"conflictingReceiptIdentities\":" << receipt_conflicts
            << ",\"quarantines\":[";
  bool first_group = true;
  for (const auto& [key, group] : conversions) {
    (void)key;
    if (group.reasons.empty()) continue;
    if (!first_group) std::cout << ',';
    first_group = false;
    std::cout << "{\"inputRows\":[";
    bool first = true;
    for (const auto row : group.rows) {
      if (!first) std::cout << ',';
      first = false;
      std::cout << row;
    }
    std::cout << "],\"reasons\":[";
    first = true;
    for (const auto& reason : group.reasons) {
      if (!first) std::cout << ',';
      first = false;
      std::cout << '"' << reason << '"';
    }
    std::cout << "]}";
  }
  std::cout << "]}\n";
}
}  // namespace

int main() {
  try { run(); }
  catch (const std::exception&) {
    // Input content and identities are deliberately never echoed.
    std::cerr << "EVIDENCE_AUDIT: invalid or oversized normalized input\n";
    return 2;
  }
}
