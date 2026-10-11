class VoiceService {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = [];
    // Opt-in: spoken output in a shared room can disclose who was just verified.
    this.enabled = localStorage.getItem('frams_voice_enabled') === 'true';
    this.currentUtterance = null;
    this.lastSpeakTime = 0;
    this.isSpeaking = false;
    this.cooldown = 1500; // ms

    // Load voices
    if (!this.synth) return; // browser without Web Speech API
    this._loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this._loadVoices();
    }
  }

  _loadVoices() {
    this.voices = this.synth.getVoices();
  }

  getAssistantVoice() {
    // F.R.I.D.A.Y: Prefer Female Voice (UK English or similar)
    return this.voices.find(v => v.name.includes('Female') && v.name.includes('UK')) ||
           this.voices.find(v => v.name.includes('Female')) ||
           this.voices.find(v => v.lang.includes('en-GB')) ||
           this.voices.find(v => v.lang.includes('en-IE')) || // Irish English for F.R.I.D.A.Y
           this.voices.find(v => v.lang.includes('en-US')) ||
           this.voices[0];
  }

  speak(text, priority = false) {
    if (!this.enabled || !this.synth) return;

    try {
      const now = Date.now();
      
      if (priority) {
        this.synth.cancel();
        this.isSpeaking = false;
      } else if (this.isSpeaking || (now - this.lastSpeakTime < this.cooldown)) {
        // Skip if already speaking or in cooldown to avoid spam
        return;
      }

      this.isSpeaking = true;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = this.getAssistantVoice();
      utterance.pitch = 1.0;
      utterance.rate = 0.95; 
      utterance.volume = 0.8;

      utterance.onend = () => {
        this.isSpeaking = false;
        this.lastSpeakTime = Date.now();
      };

      utterance.onerror = (event) => {
        if (event.error !== 'interrupted') {
          console.warn('A.R.I.A. -> Vocal circuit delay:', event.error);
        }
        this.isSpeaking = false;
      };

      this.currentUtterance = utterance;
      // Use catch-all around speak and provide short delay if synth is busy
      if (this.synth.speaking) {
          this.synth.cancel();
      }
      this.synth.speak(utterance);
    } catch (err) {
      console.error('VoiceService critical failure:', err);
      this.isSpeaking = false;
    }
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
  }

  setEnabled(val) {
    this.enabled = val;
    localStorage.setItem('frams_voice_enabled', val);
    if (!val) this.stop();
  }

  isEnabled() {
    return this.enabled;
  }
}

const voiceService = new VoiceService();
export default voiceService;
