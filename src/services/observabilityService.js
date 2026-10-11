class ObservabilityService {
  constructor() {
    this.logs = [];
    this.maxLogs = 20;
    this.subscribers = new Set();
    this.metrics = {
      fps: 0,
      lastApiStatus: 'IDLE',
      scannerState: 'IDLE',
      activeUser: null,
      memory: 'N/A'
    };
  }

  logEvent(type, message, data = null) {
    const event = {
      timestamp: new Date().toLocaleTimeString(),
      type: type.toUpperCase(),
      message,
      data,
      id: Math.random().toString(36).substr(2, 9)
    };

    this.logs = [event, ...this.logs].slice(0, this.maxLogs);
    console.log(`[ARIA-OBS] ${event.type}: ${message}`, data || '');
    this.notifySubscribers();
  }

  updateMetrics(newMetrics) {
    this.metrics = { ...this.metrics, ...newMetrics };
    this.notifySubscribers();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers() {
    this.subscribers.forEach(callback => callback({ logs: this.logs, metrics: this.metrics }));
  }

  getSnapshot() {
    return { logs: this.logs, metrics: this.metrics };
  }
}

const observabilityService = new ObservabilityService();
export default observabilityService;
