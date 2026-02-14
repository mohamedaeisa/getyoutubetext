'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useYoutubeTranscript } from '../../hooks/useYoutubeTranscript';
import { TranscriptRequest } from '../../types/transcript.types';

const supportedFormats: Array<TranscriptRequest['outputFormat']> = [
  'json',
  'text',
  'timestamped',
  'srt',
  'markdown',
];

export function YoutubeTranscriptWidget() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<TranscriptRequest['outputFormat']>('json');
  const [language, setLanguage] = useState('');
  const [withAi, setWithAi] = useState(false);

  const { data, isLoading, error, run, abort } = useYoutubeTranscript();

  const exportContent = useMemo(() => {
    if (!data) return '';
    return typeof data.exportPayload === 'string'
      ? data.exportPayload
      : JSON.stringify(data.exportPayload, null, 2);
  }, [data]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run({
      url,
      outputFormat: format,
      language: language || undefined,
      withAiEnhancements: withAi,
      summaryLength: 'medium',
    });
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(exportContent);
  };

  const download = () => {
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `youtube-transcript.${format === 'json' ? 'json' : 'txt'}`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <section className="rounded-md border border-slate-200 p-4 shadow-sm">
      <h2 className="text-lg font-semibold">YouTube Transcript Extractor</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input
          className="w-full rounded border p-2"
          type="url"
          required
          placeholder="Paste YouTube URL"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />

        <div className="flex gap-2">
          <input
            className="flex-1 rounded border p-2"
            placeholder="Language (optional, e.g. en)"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          />

          <select
            className="rounded border p-2"
            value={format}
            onChange={(event) => setFormat(event.target.value as TranscriptRequest['outputFormat'])}
          >
            {supportedFormats.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withAi} onChange={(event) => setWithAi(event.target.checked)} />
          Enable AI enhancements
        </label>

        <div className="flex gap-2">
          <button className="rounded bg-slate-900 px-3 py-2 text-white" disabled={isLoading} type="submit">
            {isLoading ? 'Extracting...' : 'Extract transcript'}
          </button>
          {isLoading && (
            <button type="button" className="rounded border px-3 py-2" onClick={abort}>
              Abort
            </button>
          )}
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {data && (
        <div className="mt-4 space-y-3">
          <div className="text-sm text-slate-600">
            Source: <b>{data.transcript.source}</b> • Language: <b>{data.transcript.language}</b> • Segments:{' '}
            <b>{data.transcript.segments.length}</b>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={copyToClipboard} className="rounded border px-2 py-1 text-sm">
              Copy
            </button>
            <button type="button" onClick={download} className="rounded border px-2 py-1 text-sm">
              Download
            </button>
          </div>

          <pre className="max-h-96 overflow-auto rounded bg-slate-50 p-3 text-xs">{exportContent}</pre>
        </div>
      )}
    </section>
  );
}
