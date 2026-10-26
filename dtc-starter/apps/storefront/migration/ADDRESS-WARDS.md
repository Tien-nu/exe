# Province-dependent ward selection

Checkout shipping, separate billing, shop registration and shop profile use the shared WardSelect component. Selecting a province loads only wards from that province through `/api/addresses/wards?province=<canonical code>`. Changing province clears the ward and optional legacy district. Pending and failed loads cannot submit a required ward; failed requests expose a Retry button. Out-of-order responses are aborted/ignored and cached results remain scoped by province.

The checked-in snapshot has 34 provinces and 3,321 wards, downloaded from Province Open API v2 (post July 2025 administrative changes): https://provinces.open-api.vn/. Source URL and fetch timestamp are embedded in `src/server/data/vietnam-wards.json`. No customer data is sent to this provider. There are no upstream calls during checkout. Ward codes are source administrative codes, not GHN IDs.

Refresh deliberately with:

```sh
node --import tsx scripts/update-vietnam-wards.mts
```

Review province coverage, ward counts and tests before deploying refreshed data. Existing saved ward names absent from the current province's list require the customer to select a current ward when editing; saved database records are not rewritten automatically. District remains optional for historical addresses; ward selection no longer depends on a district.

Test: select Ha Noi and Ba Dinh ward, switch to Ho Chi Minh City, verify ward is cleared and the dropdown contains Sai Gon rather than Ba Dinh. Repeat for billing (uncheck same-as-shipping) and shop pickup details. Change the province quickly to verify stale responses never restore the previous province's ward list.
