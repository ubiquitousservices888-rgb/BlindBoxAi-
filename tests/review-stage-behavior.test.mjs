import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Disposable behavioral test: executes the actual Edge stage() implementation
// against an isolated in-memory Supabase adapter. Never touches production.
const source = readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
const begin = source.indexOf("async function stage(req: Request, body: any)");
const end = source.indexOf("async function listReady(", begin);
assert.ok(begin >= 0 && end > begin, "the production stage() implementation must exist");
const stageCode = source.slice(begin, end).replace("req: Request, body: any", "req, body");
const makeStage = new Function(
  "db", "stagingAuthorized", "safeHttps", "clean", "createHash", "verticalFor", "json",
  stageCode + "\nreturn stage;",
);
const validUrl = "https://storage.example.test/media/review/test.mp4";
const runId = "rv-" + createHash("sha256").update(validUrl).digest("hex").slice(0, 16);
const row = (status) => ({research_run_id:runId, status, title:"Owner-verified collectible", video_url:validUrl, approved_at:status === "approved" ? "2026-10-01T00:00:00Z" : null});
function setup(initial, authorized = true) {
  const records = new Map(initial ? [[runId, structuredClone(initial)]] : []);
  let writes = 0;
  const db = {
    from(name) {
      assert.equal(name, "review_video_queue");
      return {
        upsert(record, options) {
          assert.deepEqual(options, {onConflict:"research_run_id", ignoreDuplicates:true});
          return {async select() {
            if (records.has(record.research_run_id)) return {data:[], error:null};
            writes++;
            records.set(record.research_run_id, structuredClone(record));
            return {data:[{research_run_id: record.research_run_id}],error:null};
          }};
        },
        select() {
          return {
            eq(field,value) {
              assert.equal(field,"research_run_id");
              return {async maybeSingle() {
                const stored=records.get(value);
                return {data:stored ? {status:stored.status,title:stored.title,video_url:stored.video_url}:null,error:null};
              }};
            },
          };
        },
      };
    },
  };
  const stage = makeStage(
    db, async () => authorized,
    (v) => typeof v === "string" && v.startsWith("https://") ? v : null,
    (v) => String(v ?? "").trim(),
    createHash, () => "other_collectible",
    (obj, status=200) => ({status,body:obj}),
  );
  const input = {videoUrl:validUrl,title:"Owner-verified collectible",sizeBytes:5000,durationSeconds:15,width:720,height:1280};
  return {run:()=>stage({},input),records,get writes(){return writes;}};
}
test("new review inserted once; retry returns duplicate without rewriting", async () => {
  const s=setup();
  const first=await s.run();
  assert.equal(first.status,200);
  assert.equal(first.body.duplicate,false);
  const second=await s.run();
  assert.equal(second.status,200);
  assert.equal(second.body.duplicate,true);
  assert.equal(s.writes,1);
});
for (const status of ["approved","publishing","published","rejected","failed"]) {
  test("restaging cannot alter existing "+status+" record", async () => {
    const prior=row(status),s=setup(prior);
    const result=await s.run();
    assert.equal(result.status,409);
    assert.equal(s.writes,0);
    assert.deepEqual(s.records.get(runId),prior);
  });
}
test("unauthorized staging leaves queue unchanged",async () => {
  const s=setup(undefined,false);
  const result=await s.run();
  assert.equal(result.status,401);
  assert.equal(s.writes,0);
});

test("duplicate returns canonical stored title, never a new uncommitted title",async()=>{
  const stored=row("ready_for_review"); stored.title="Canonical previously reviewed title";
  const s=setup(stored), result=await s.run();
  assert.equal(result.status,200);
  assert.equal(result.body.duplicate,true);
  assert.equal(result.body.title,stored.title);
  assert.equal(s.writes,0);
});
