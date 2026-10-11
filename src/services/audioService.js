class AudioService {
  constructor() {
    this.audio = null;
    this.isMuted = localStorage.getItem('frams_muted') === 'true';
    this.fadeInterval = null;
  }

  init(url) {
    if (this.audio) {
      this.audio.pause();
    }
    this.audio = new Audio(url);
    this.audio.loop = false;
    this.audio.volume = 0;
  }

  play() {
    if (!this.audio || this.isMuted) return Promise.resolve();
    return this.audio.play();
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    clearInterval(this.fadeInterval);
  }

  fadeIn(duration = 1500) {
    if (!this.audio || this.isMuted) return;
    clearInterval(this.fadeInterval);
    
    const targetVolume = 0.5;
    const step = 0.05;
    const intervalTime = duration / (targetVolume / step);
    
    this.audio.volume = 0;
    this.fadeInterval = setInterval(() => {
      if (this.audio.volume < targetVolume) {
        this.audio.volume = Math.min(targetVolume, this.audio.volume + step);
      } else {
        clearInterval(this.fadeInterval);
      }
    }, intervalTime);
  }

  fadeOut(duration = 1000) {
    if (!this.audio) return;
    clearInterval(this.fadeInterval);

    const step = 0.05;
    const intervalTime = duration / (Math.max(0.1, this.audio.volume) / step);

    this.fadeInterval = setInterval(() => {
      if (this.audio.volume > step) {
        this.audio.volume -= step;
      } else {
        this.audio.volume = 0;
        this.audio.pause();
        clearInterval(this.fadeInterval);
      }
    }, intervalTime);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('frams_muted', this.isMuted);
    if (this.isMuted && this.audio) {
      this.audio.volume = 0;
      this.audio.pause();
    }
    return this.isMuted;
  }
}

const audioService = new AudioService();
export default audioService;
