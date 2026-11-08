import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ja } from '../copy/ja';
import { asset } from '../content/hospital-scenes';
export function Icon({ name }: { name: 'back' | 'sound' | 'help' | 'zoom' | 'shield' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === 'back' ? (
        <path d="m15 5-7 7 7 7" />
      ) : name === 'sound' ? (
        <path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16" />
      ) : name === 'zoom' ? (
        <>
          <circle cx="10" cy="10" r="6.5" />
          <path d="m15 15 6 6M7 10h6m-3-3v6" />
        </>
      ) : name === 'shield' ? (
        <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM12 8v5m0 3h.01" />
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.4 9a2.6 2.6 0 1 1 4 2.2c-1.2.7-1.4 1.2-1.4 2.3M12 17h.01" />
        </>
      )}
    </svg>
  );
}
export function Header({
  demo,
  back,
  camera = false,
}: {
  demo: boolean;
  back?: () => void;
  camera?: boolean;
}) {
  return (
    <header className="masthead">
      <div className={back ? 'identity-group' : undefined}>
        {back && (
          <button className="back" onClick={back} aria-label={ja.back}>
            <Icon name="back" />
          </button>
        )}
        <div className="identity">
          <img src={asset('tonari-mark')} alt="" />
          <span>{ja.brand}</span>
        </div>
      </div>
      <span className="demo">{demo ? ja.demo : camera ? ja.camera : ja.mock}</span>
    </header>
  );
}
export function Heading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);
  return (
    <h1 id="instruction" ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}
export const Word = ({ children }: { children: ReactNode }) => (
  <>
    <span className="word">{children}</span>
    <wbr />
  </>
);
export function Primary({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  const locked = useRef(false),
    mounted = useRef(0);
  useEffect(() => {
    mounted.current = performance.now();
    locked.current = false;
  }, []);
  return (
    <div className="reply">
      <button
        type="button"
        className="done"
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.repeat) e.preventDefault();
        }}
        onClick={(e) => {
          // A double-click must never confirm the action on the screen it just opened.
          if (locked.current || e.detail > 1 || e.timeStamp < mounted.current) return;
          locked.current = true;
          onClick();
          queueMicrotask(() => {
            locked.current = false;
          });
        }}
      >
        {children}
      </button>
    </div>
  );
}
export function Help({ onClick, label = ja.help }: { onClick: () => void; label?: string }) {
  return (
    <button className="help" onClick={onClick}>
      <Icon name="help" />
      {label}
    </button>
  );
}
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId(),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const element = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLElement>('#instruction')?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return;
        const items = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
    >
      <h2 id={id}>{title}</h2>
      {children}
    </dialog>
  );
}
export function Voice({
  playing,
  failed,
  onClick,
  choice = false,
  label,
}: {
  playing: boolean;
  failed: boolean;
  onClick: () => void;
  choice?: boolean;
  label?: string;
}) {
  return (
    <>
      <button className="voice" aria-pressed={playing} onClick={onClick}>
        <Icon name="sound" />
        <span>{playing ? ja.voiceStop : (label ?? (choice ? ja.optionsVoice : ja.again))}</span>
      </button>
      {failed && (
        <p className="feedback" role="status">
          {ja.voiceUnavailable}
        </p>
      )}
    </>
  );
}
