import modal, os

app = modal.App("tracemint-glimmer-e2e")
vol = modal.Volume.from_name("glimmer-weights", create_if_missing=True)
key = os.environ["GLIMMER_KEY"]
url = os.environ["GLIMMER_URL"]  # .../v1/chat/completions on the deployed app

PROMPT = """You are a revenue digest assistant. Given these weekly numbers, write a 3-sentence plain-English digest a solo founder can read. Write only the digest, no preamble.
Gross: $1,845.00 (35 charges), Refunds: $98.00 (5.3% refund rate), Net: $1,747.00, week-over-week net change: -1.2%. Top source: organic ($920 gross)."""

@app.function(volumes={"/models": vol}, timeout=1500)
def call():
    import urllib.request, json
    body = json.dumps({"model":"muse-glimmer","messages":[{"role":"user","content":PROMPT}],"max_tokens":900,"temperature":0.3}).encode()
    # auth check: unauthenticated request must fail
    try:
        req0 = urllib.request.Request(url, data=body, headers={"Content-Type":"application/json"})
        urllib.request.urlopen(req0, timeout=120)
        unauth = "NO-401-ERROR (UNEXPECTED)"
    except Exception as e:
        unauth = "rejected as expected: %s" % str(e)[:80]
    req = urllib.request.Request(url, data=body, headers={"Content-Type":"application/json","Authorization":"Bearer "+key})
    with urllib.request.urlopen(req, timeout=1200) as r:
        resp = r.read().decode()
    with open("/models/e2e_result.txt","w") as f:
        f.write("UNAUTH CHECK: %s\nRESPONSE:\n%s\n" % (unauth, resp))
    vol.commit()
