-- docs/17 F4: an agreed transport price recorded at loading must carry the loading's currency. The demo seed set the
-- currency on the loading after the cost line was written, so one trip showed USD 3,050,000 (= UGX 3,050,000).
-- Repair any "Agreed at loading" Transport cost whose currency disagrees with its loading, at the approved month-average
-- rate of the loading month (or the latest earlier month, else the first one on file — same rule as rules.fxFor).
UPDATE "trip_costs" c SET
  "currency" = l."transport_currency",
  "fx_rate" = r."avg",
  "amount_usd" = round((c."amount" / r."avg")::numeric, 2)::double precision
FROM "shipments" s
JOIN "loadings" l ON l."po_id" = s."po_id" AND l."truck_no" = s."truck_no"
CROSS JOIN LATERAL (
  SELECT f."avg" FROM "fx_rates" f
  WHERE f."currency" = l."transport_currency"
  ORDER BY (f."month" <= to_char(coalesce(l."loaded_at", now()), 'YYYY-MM')) DESC,
           CASE WHEN f."month" <= to_char(coalesce(l."loaded_at", now()), 'YYYY-MM') THEN f."month" END DESC,
           f."month" ASC
  LIMIT 1
) r
WHERE c."shipment_id" = s."id" AND c."kind" = 'Transport' AND c."doc_ref" LIKE 'Agreed at loading%'
  AND s."from_warehouse_id" IS NULL AND l."status" = 'Loaded' AND l."transport_currency" <> 'USD'
  AND c."currency" <> l."transport_currency" AND c."amount" = l."agreed_transport";
