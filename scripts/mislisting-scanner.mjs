import fs from "node:fs";
import { assertCallBudget, flagIdentifierMismatch } from "../lib/mislisting-scanner-core.mjs";

const TOKEN_URL="https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL="https://api.ebay.com/buy/browse/v1/item_summary/search";
const SUPABASE_URL=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
const CLIENT_ID=String(process.env.EBAY_CLIENT_ID||"").trim();
const CLIENT_SECRET=String(process.env.EBAY_CLIENT_SECRET||"").trim();
const REQUEST_URL=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const REQUEST_TOKEN=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const watchlist=JSON.parse(fs.readFileSync(new URL("../data/mislisting-watchlist.json",import.meta.url),"utf8"));

if(!CLIENT_ID||!CLIENT_SECRET) throw new Error("eBay application credentials are not configured");
if(!SUPABASE_URL||!REQUEST_URL||!REQUEST_TOKEN) throw new Error("OIDC or Supabase configuration unavailable");

const plannedCalls=assertCallBudget(watchlist);
let browseCalls=0;

async function token(){
  const basic=Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`,"utf8").toString("base64");
  const response=await fetch(TOKEN_URL,{
    method:"POST",
    headers:{Authorization:`Basic ${basic}`,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"client_credentials",scope:"https://api.ebay.com/oauth/api_scope"}),
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.access_token) throw new Error(`eBay OAuth failed: ${response.status}`);
  return body.access_token;
}
const accessToken=await token();
const flags=[];
for(const item of watchlist){
  browseCalls+=1;
  if(browseCalls>500) throw new Error("Browse call budget exceeded at runtime");
  const url=new URL(SEARCH_URL);
  url.searchParams.set("q",String(item.query).slice(0,160));
  url.searchParams.set("limit","50");
  url.searchParams.set("filter","buyingOptions:{FIXED_PRICE}");
  const response=await fetch(url,{
    headers:{
      Authorization:`Bearer ${accessToken}`,
      Accept:"application/json",
      "X-EBAY-C-MARKETPLACE-ID":"EBAY_US"
    }
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`eBay Browse search failed: ${response.status}`);
  for(const listing of Array.isArray(body.itemSummaries)?body.itemSummaries:[]){
    const flag=flagIdentifierMismatch(item,listing);
    if(flag?.listingId) flags.push(flag);
  }
}

const oidcResponse=await fetch(`${REQUEST_URL}&audience=${encodeURIComponent("blindboxai-mislisting-scanner")}`,{
  headers:{Authorization:`Bearer ${REQUEST_TOKEN}`}
});
if(!oidcResponse.ok) throw new Error(`OIDC request failed: ${oidcResponse.status}`);
const oidc=(await oidcResponse.json()).value;
const ingest=await fetch(`${SUPABASE_URL}/functions/v1/mislisting-scanner-ingest`,{
  method:"POST",
  headers:{Authorization:`Bearer ${oidc}`,"Content-Type":"application/json"},
  body:JSON.stringify({action:"ingest",scannedAt:new Date().toISOString(),plannedCalls,browseCalls,flags})
});
const result=await ingest.json().catch(()=>({}));
if(!ingest.ok) throw new Error(result?.error||`Scanner ingest failed: ${ingest.status}`);
console.log(`MISLISTING_SCANNER_BROWSE_CALLS=${browseCalls}`);
console.log(`MISLISTING_SCANNER_FLAGS=${flags.length}`);
console.log("MISLISTING_SCANNER_STORED=true");
