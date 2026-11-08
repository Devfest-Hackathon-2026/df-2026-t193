import type { ReactNode } from 'react';
import { asset, scenes } from '../content/hospital-scenes';
import { Icon } from './ui';
import { ja } from '../copy/ja';
export function KioskScene({
  name,
  stepId,
  label,
  onZoom,
  children,
}: {
  name?: string;
  stepId?: string;
  label?: string;
  onZoom?: () => void;
  children?: ReactNode;
}) {
  const scene = stepId ? scenes[stepId] : null;
  return (
    <figure className="world" aria-label="受付機の案内">
      <img
        src={asset(name ?? scene?.name ?? 'terminal-neutral')}
        alt={
          label
            ? `模擬の受付機。「${label}」ボタンを黄色い枠で示しています。`
            : '模擬の受付機の案内用イメージです。'
        }
      />
      {onZoom && (
        <button className="zoom" onClick={onZoom} aria-label={`${label}ボタンを拡大する`}>
          <Icon name="zoom" />
          {ja.zoom}
        </button>
      )}
      {children}
    </figure>
  );
}
export function SceneDetail({ stepId, label }: { stepId: string; label: string }) {
  const scene = scenes[stepId];
  if (!scene) return null;
  const width = 160,
    height = width / 1.3;
  return (
    <div className="detail-picture">
      <img
        src={asset(scene.name)}
        alt={`同じ模擬受付機の${label}ボタンの拡大表示`}
        style={{
          width: '250%',
          left: `${(-((scene.x ?? 290) - width / 2) / width) * 100}%`,
          top: `${(-((scene.y ?? 307) - height / 2) / height) * 100}%`,
        }}
      />
    </div>
  );
}
