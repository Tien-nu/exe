/** Reads plain numbers and Medusa BigNumber values alike. */
export const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0
  }

  if (typeof value === "object" && "numeric" in (value as object)) {
    return Number((value as { numeric: unknown }).numeric)
  }

  return Number(value)
}
