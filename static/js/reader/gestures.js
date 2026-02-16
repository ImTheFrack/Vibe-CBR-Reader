export class GestureController {
  constructor(element, onSwipeLeft, onSwipeRight) {
    this.element = element;
    this.onSwipeLeft = onSwipeLeft;
    this.onSwipeRight = onSwipeRight;
    this.startX = 0;
    this.startY = 0;
    this.threshold = 50;

    this.touchStartHandler = (e) => {
      this.startX = e.touches[0].clientX;
      this.startY = e.touches[0].clientY;
    };

    this.touchEndHandler = (e) => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;

      const diffX = endX - this.startX;
      const diffY = endY - this.startY;

      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > this.threshold) {
        if (diffX > 0) {
          this.onSwipeRight();
        } else {
          this.onSwipeLeft();
        }
      }
    };

    this.init();
  }

  init() {
    this.element.addEventListener('touchstart', this.touchStartHandler, { passive: true });
    this.element.addEventListener('touchend', this.touchEndHandler, { passive: true });
  }

  destroy() {
    this.element.removeEventListener('touchstart', this.touchStartHandler);
    this.element.removeEventListener('touchend', this.touchEndHandler);
  }
}
