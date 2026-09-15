/** โทนเสียงแจ้งเตือนออเดอร์ */
export type SoundTone = 'CHIME' | 'BELL' | 'ALERT';

/**
 * สังเคราะห์เสียงสัญญาณเตือนเมื่อมีออเดอร์ใหม่เข้ามาด้วย Web Audio API
 * รองรับ 3 โทนเสียง พร้อมระดับเสียงที่ปรับได้ ไม่ต้องพึ่งพาไฟล์เสียงภายนอก (.mp3)
 *
 * @param tone - โทนเสียง ('CHIME' | 'BELL' | 'ALERT')
 * @param volume - ระดับความดัง (0.0 ถึง 1.0) ค่านอกช่วงจะถูกบีบให้อยู่ในช่วงนี้
 * @returns ไม่คืนค่า มีผลข้างเคียงคือเล่นเสียงออกลำโพง และเงียบไปเฉย ๆ
 *          หากเบราว์เซอร์ยังไม่อนุญาตให้เล่นเสียงอัตโนมัติ
 */
export function playNewOrderSound(tone: SoundTone = 'CHIME', volume: number = 0.6) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const masterGain = Math.max(0, Math.min(1, volume));

    if (tone === 'BELL') {
      // โทนกระดิ่งโลหะก้องกังวาน (Kitchen Service Bell)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6
      osc2.frequency.setValueAtTime(2093, ctx.currentTime); // C7 overtone

      gain.gain.setValueAtTime(masterGain * 0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.65);
      osc2.stop(ctx.currentTime + 0.65);
    } else if (tone === 'ALERT') {
      // โทนสัญญาณเตือนฉุกเฉิน 3 สเต็ป (Urgent Tri-Tone)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2); // A5

      gain.gain.setValueAtTime(masterGain * 0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else {
      // CHIME: เสียงกระดิ่งสองโทนละมุน (Default Two-Tone Chime)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(masterGain * 0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch {
    // ป้องกันการทำงานล้มเหลวหากเบราว์เซอร์ยังไม่เปิดให้เล่นเสียงอัตโนมัติก่อนคลิก
  }
}
