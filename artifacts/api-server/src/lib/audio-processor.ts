import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";
import { logger } from "./logger";
import { getEffectiveAiKey } from "./cs-bot-ai";

export async function transcribeAudio(
  buffer: Buffer,
  userId: number,
  mimetype: string = "audio/ogg"
): Promise<string | null> {
  try {
    // 1. Get Effective API Key (User key OR Admin key if plan allows)
    const effectiveAiKey = await getEffectiveAiKey(userId, "openai");

    if (!effectiveAiKey) {
      logger.warn("[Audio] Transcription skipped: No API key found");
      return null;
    }

    // 2. Prepare Temp File
    // Whisper supports: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm
    const ext = mimetype.split("/")[1]?.split(";")[0] || "ogg";
    const tempPath = path.join(os.tmpdir(), `wa_audio_${Date.now()}.${ext}`);
    fs.writeFileSync(tempPath, buffer);

    // 3. Call OpenAI Whisper
    const openai = new OpenAI({ apiKey: effectiveAiKey.key });
    
    logger.info({ tempPath }, "[Audio] Sending to Whisper");
    
    const resp = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: "whisper-1",
    });

    // 4. Cleanup
    fs.unlinkSync(tempPath);

    return resp.text.trim();
  } catch (err) {
    logger.error({ err }, "[Audio] Transcription error");
    return null;
  }
}
