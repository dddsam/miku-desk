export const VIDEO = Object.freeze({
  standby: 'miku_standby.mp4', happy: 'miku_work_happy.mp4',
  angry: 'miku_work_angry.mp4', confused: 'miku_not_understand.mp4',
  finished: 'miku_finishwork.mp4'
});
export class PetState {
  constructor(emit = () => {}) { this.emit = emit; this.busy = false; this.rejected = false; this.idle = false; this.finishing = false; this.mood = 'happy'; this.preview = null; this.value = ''; this.update(); }
  update() {
    const next = this.preview || (this.rejected ? 'confused' : this.finishing ? 'finished' : this.idle ? 'confused' : this.busy ? this.mood : 'standby');
    if (next !== this.value) { this.value = next; this.emit({ state: next, busy: this.busy }); }
    return next;
  }
  start(mood = 'happy') { this.preview = null; this.busy = true; this.finishing = false; this.rejected = false; this.mood = mood === 'angry' ? 'angry' : 'happy'; this.update(); }
  reject() { this.preview = null; this.rejected = true; this.finishing = false; this.update(); }
  complete() { this.busy = false; this.finishing = true; this.rejected = false; this.update(); }
  stop() { this.busy = false; this.finishing = false; this.update(); }
  ended() { this.finishing = false; this.update(); }
  activity() { this.idle = false; if (!this.busy) this.rejected = false; this.update(); }
  setIdle(value) { this.idle = value; this.update(); }
}
