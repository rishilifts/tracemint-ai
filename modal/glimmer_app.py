import modal, os

app = modal.App("tracemint-glimmer-test")
vol = modal.Volume.from_name("glimmer-weights", create_if_missing=True)
key = os.environ["GLIMMER_KEY"]  # deploy-time env, injected as the app secret

image = modal.Image.from_registry("ghcr.io/ggml-org/llama.cpp:server", add_python="3.12").dockerfile_commands("ENTRYPOINT []")

# Enforcement stack (documented Modal behavior, modal.com/docs):
# - timeout=900: platform kills any single function execution after 15 min.
# - scaledown_window=300: container scales to zero after 5 min with no inputs.
# - max_containers=1: the autoscaler may never boot more than one container;
#   extra inputs queue instead of adding more containers.
# - @modal.concurrent(max_inputs=1): one input at a time inside that container.
# - llama-server --parallel 1 + app-side max_tokens=640: one slot, bounded decode
#   length (token count, not wall-clock time).
# - a hard usage limit is set on the Modal account: a wallet-level spend bound.
@app.cls(
    cpu=16.0, memory=28672,
    image=image,
    volumes={"/models": vol},
    timeout=900,
    scaledown_window=300,
    max_containers=1,
    secrets=[modal.Secret.from_dict({"GLIMMER_KEY": key})],
)
@modal.concurrent(max_inputs=1)
class S:
    @modal.enter()
    def start(self):
        import subprocess, urllib.request, shutil
        path = "/models/Muse-Glimmer-30B-UD-Q4_K_XL.gguf"
        if not os.path.exists(path):
            with urllib.request.urlopen("https://huggingface.co/unsloth/Muse-Glimmer-30B-GGUF/resolve/main/Muse-Glimmer-30B-UD-Q4_K_XL.gguf") as r, open(path+".part","wb") as f:
                shutil.copyfileobj(r, f, 1024*1024)
            os.rename(path+".part", path)
        self.proc = subprocess.Popen([
            "/app/llama-server", "--model", path,
            "--host", "0.0.0.0", "--port", "8000",
            "--ctx-size", "3072", "--threads", "16", "--parallel", "1",
            "--api-key", os.environ["GLIMMER_KEY"],
        ])

    @modal.web_server(8000, startup_timeout=900)
    def serve(self):
        pass
