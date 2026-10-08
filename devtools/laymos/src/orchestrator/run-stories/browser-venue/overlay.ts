import type { DeviceKind } from '../../../story/schema/index.js';

/**
 * Drawn into every page so a Recording shows what a person would see: the
 * pointer and its presses on desktop, fingers on a phone, and pressed keys.
 * It only listens to real input events and never takes pointer events.
 */
export function overlayScript(kind: DeviceKind): string {
  return `(() => {
  window.__name = window.__name || ((target) => target);
  if (window.top !== window.self) return;
  const kind = ${JSON.stringify(kind)};
  let host = null;
  let shadow = null;
  let pointer = null;
  let badge = null;
  const fingers = new Map();

  const raise = () => {
    if (host === null || typeof host.showPopover !== 'function') return;
    try {
      if (host.matches(':popover-open')) host.hidePopover();
      host.showPopover();
    } catch {}
  };

  const mount = () => {
    if (shadow !== null) return shadow;
    if (document.documentElement === null) return null;
    host = document.createElement('laymos-overlay');
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('popover', 'manual');
    host.style.cssText = 'all:initial;display:block;position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;z-index:2147483647;';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = ${JSON.stringify(styles)};
    document.documentElement.appendChild(host);
    raise();
    return shadow;
  };

  const add = (className, html) => {
    const root = mount();
    if (root === null) return null;
    const element = document.createElement('div');
    element.className = className;
    if (html) element.innerHTML = html;
    root.appendChild(element);
    return element;
  };

  const place = (element, x, y) => {
    element.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
  };

  const listen = (type, handler) =>
    window.addEventListener(type, handler, { capture: true, passive: true });

  if (kind === 'desktop') {
    listen('mousemove', (event) => {
      if (pointer === null) pointer = add('pointer', ${JSON.stringify(pointerSvg)});
      if (pointer !== null) place(pointer, event.clientX, event.clientY);
    });
    listen('mousedown', (event) => {
      raise();
      if (pointer !== null) pointer.classList.add('down');
      const ripple = add('ripple');
      if (ripple === null) return;
      ripple.style.left = event.clientX + 'px';
      ripple.style.top = event.clientY + 'px';
      ripple.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0.7 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        ],
        { duration: 550, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      ).onfinish = () => ripple.remove();
    });
    listen('mouseup', () => {
      if (pointer !== null) pointer.classList.remove('down');
    });
  }

  const touch = (event) => {
    for (const point of event.changedTouches) {
      let dot = fingers.get(point.identifier);
      if (dot === undefined) {
        dot = add('finger');
        if (dot === null) return;
        fingers.set(point.identifier, dot);
        dot.animate([{ opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1 }], {
          duration: 120,
          easing: 'ease-out',
        });
      }
      place(dot, point.clientX, point.clientY);
    }
  };
  const lift = (event) => {
    for (const point of event.changedTouches) {
      const dot = fingers.get(point.identifier);
      if (dot === undefined) continue;
      fingers.delete(point.identifier);
      dot.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.6 }], {
        duration: 280,
        easing: 'ease-in',
        fill: 'forwards',
      }).onfinish = () => dot.remove();
    }
  };
  listen('touchstart', (event) => {
    raise();
    touch(event);
  });
  listen('touchmove', touch);
  listen('touchend', lift);
  listen('touchcancel', lift);

  window.__laymosKey = (label) => {
    if (badge === null) badge = add('badge');
    if (badge === null) return;
    raise();
    badge.textContent = label;
    for (const animation of badge.getAnimations()) animation.cancel();
    badge.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 10px) scale(0.94)' },
        { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.12 },
        { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.75 },
        { opacity: 0, transform: 'translate(-50%, 0) scale(1)' },
      ],
      { duration: 1200, easing: 'ease-out', fill: 'forwards' },
    );
  };
})();`;
}

const pointerSvg =
  '<svg width="24" height="30" viewBox="0 0 24 30"><path d="M2 2 L2 23 L7.5 18 L11 26 L14.5 24.5 L11 16.5 L18.5 16.5 Z" fill="#111827" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

const styles = `<style>
:host { all: initial; }
.pointer { position: fixed; left: -2px; top: -2px; width: 24px; height: 30px; transform: translate(-100px, -100px); filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4)); }
.pointer svg { display: block; transform-origin: 2px 2px; transition: transform 120ms ease-out; }
.pointer.down svg { transform: scale(0.82); }
.ripple { position: fixed; width: 56px; height: 56px; border-radius: 50%; border: 2px solid rgba(37, 99, 235, 0.95); background: rgba(59, 130, 246, 0.28); }
.finger { position: fixed; left: -21px; top: -21px; width: 38px; height: 38px; border-radius: 50%; background: rgba(255, 255, 255, 0.6); border: 2px solid rgba(17, 24, 39, 0.8); box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35); }
.badge { position: fixed; left: 50%; bottom: 56px; transform: translate(-50%, 0); padding: 10px 20px; border-radius: 14px; background: rgba(17, 24, 39, 0.9); color: #ffffff; font: 600 30px/1.1 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: 0.06em; white-space: nowrap; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); opacity: 0; }
</style>`;
