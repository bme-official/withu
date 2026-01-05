export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">withu voice widget（セルフテスト）</h1>
      <p className="text-sm text-zinc-600">
        このページは /widget.js を同一オリジンから読み込み、右下にウィジェットを表示します。
        WordPress等へは README の script 1行を貼ってください。
      </p>

      <div className="rounded-xl border bg-white p-4 text-sm">
        <div className="font-medium">確認URL</div>
        <ul className="mt-2 list-disc pl-5 text-zinc-700">
          <li>/healthz</li>
          <li>/widget.js（= /widget のrewrite）</li>
          <li>/api/session /api/asr /api/chat /api/logs /api/tts</li>
        </ul>
      </div>

      {/* Self-test embed */}
      <script src="/widget.js" data-site-id="self-test" async></script>
    </main>
  );
}
