// Return fixed labels only. Driver messages may contain credentials/hosts.
export function diagnoseMongoError(error) {
  const errors = [error, error?.cause]
  for (const server of error?.reason?.servers?.values?.() ?? []) {
    errors.push(server.error, server.error?.cause)
  }
  const codes = errors.filter(Boolean).map((value) => value.code)
  const messages = errors.filter(Boolean).map((value) => String(value.message ?? "")).join(" ")
  if (codes.includes(18) || /authentication failed|bad auth/i.test(messages)) {
    return "AUTH_FAILED: Check Database User username/password and encode special characters in the URI password."
  }
  if (codes.includes(13)) return "PERMISSION_DENIED: Database User needs readWrite on the selected staging database."
  if (codes.includes(11000)) return "DUPLICATE_DATA: A unique index cannot be created because records have duplicate values."
  if (errors.some((value) => value?.name === "MongoParseError") || /invalid scheme|invalid connection string/i.test(messages)) {
    return "URI_INVALID: Copy the Drivers connection string again and replace its placeholders."
  }
  if (codes.some((code) => ["ENOTFOUND", "EAI_AGAIN", "ESERVFAIL", "ETIMEOUT"].includes(code))) {
    return "DNS_FAILED: Check the cluster hostname and your network DNS."
  }
  if (/TLS|SSL|certificate/i.test(messages)) {
    return "TLS_FAILED: TLS handshake failed. Check Atlas IP Access List, VPN/proxy, firewall and network. This does not prove the password is incorrect."
  }
  if (error?.name === "MongoServerSelectionError" || /timed out|ECONNREFUSED|ECONNRESET/i.test(messages)) {
    return "NETWORK_FAILED: Check cluster availability, Atlas IP Access List and outbound network access to MongoDB."
  }
  return "UNKNOWN_FAILURE: Connection/index operation failed; further diagnostics are needed."
}
