# youtube-transcript-module (EDUVA)

Enterprise-grade YouTube transcript extraction module for EDUVA, built for Next.js App Router + Vercel serverless.

## Folder Structure

```text
/app
  /api
    /youtube-transcript
      route.ts
/components
  /youtube-transcript
    YoutubeTranscriptWidget.tsx
/hooks
  useYoutubeTranscript.ts
/services
  youtubeTranscriptService.ts
/lib
  /youtube
    extractVideoId.ts
    fetchCaptions.ts
    fallbackSpeechToText.ts
/types
  transcript.types.ts
/utils
  retry.ts
  logger.ts
```

## Integration Contract (EDUVA)

- Service layer: `services/youtubeTranscriptService.ts`
- Hook: `hooks/useYoutubeTranscript.ts`
- UI widget: `components/youtube-transcript/YoutubeTranscriptWidget.tsx`

The API accepts a YouTube URL and returns structured transcript JSON plus optional AI-enriched metadata that can feed EDUVA memory, notes, chunking, and voice flows.

## API Request

`POST /api/youtube-transcript`

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "language": "en",
  "withAiEnhancements": true,
  "summaryLength": "medium",
  "translationTargetLanguage": "es",
  "outputFormat": "json"
}
```

## Vercel Deployment Steps

1. Add module files to your Next.js 14+ EDUVA app.
2. Configure environment variables from `.env.example` in Vercel project settings.
3. Ensure the route is deployed as serverless (`runtime = nodejs`) and not statically cached.
4. Optionally connect external providers:
   - YouTube Data API for official captions.
   - Audio extractor + Speech-to-Text provider for fallback.
   - AI enhancement endpoint for advanced NLP features.
5. Deploy and verify with a mix of captioned and non-captioned videos.

## Scalability Strategy

- Stateless serverless handlers for horizontal scale.
- In-process short TTL cache for hot request reduction.
- Retry + exponential backoff around upstream API calls.
- AbortController + timeout to avoid long-running function failures.
- Streaming JSON response path for large transcript payloads.
- Rate limiting guard per client IP to reduce abuse.
- Pluggable background processing trigger when transcript size exceeds real-time limits.

## Future EDUVA Expansion Notes

- Plug transcript segments directly into EDUVA chunking pipeline (`segments[]` already normalized).
- Store `aiEnhancements` into EDUVA context memory for tutor continuity.
- Wire transcript language metadata to EDUVA voice system for TTS persona selection.
- Bind `qa[]`, `chapters[]`, and `keywords[]` into EDUVA notes auto-generation cards.
- Replace in-memory cache/rate-limit with Vercel KV + Upstash Redis for multi-region consistency.
