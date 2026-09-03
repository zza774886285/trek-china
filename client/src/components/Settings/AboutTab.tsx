import { ExternalLink, Github, Info } from 'lucide-react';
import React from 'react';
import { useTranslation } from '../../i18n';
import Section from './Section';

interface Props {
  appVersion: string;
}

export default function AboutTab({ appVersion }: Props): React.ReactElement {
  const { t } = useTranslation();

  return (
    <Section title={t('settings.about')} icon={Info}>
      <p
        className="text-content-secondary"
        style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', lineHeight: 1.6, marginBottom: 12, marginTop: -4 }}
      >
        {t('settings.about.description')}
      </p>

      <div
        className="bg-surface-card rounded-xl border border-edge px-5 py-4"
        style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold text-content">TREK China</span>
          <span
            className="bg-surface-tertiary text-content-faint"
            style={{
              display: 'inline-flex',
              borderRadius: 99,
              padding: '1px 7px',
              fontSize: 'calc(10px * var(--fs-scale-caption, 1))',
              fontWeight: 600,
            }}
          >
            v{appVersion}
          </span>
        </div>
        <p className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-caption, 1))', lineHeight: 1.6, marginBottom: 8 }}>
          基于 <a href="https://github.com/liketrek/TREK" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">TREK</a> (AGPL v3) 的中国适配版
        </p>
        <p className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-caption, 1))', lineHeight: 1.6, marginBottom: 8 }}>
          自托管旅行规划器 · 高德地图 · 中文 UI · 实时协作
        </p>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <a
          href="https://github.com/zza774886285/trek-china/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 overflow-hidden rounded-xl border border-edge bg-surface-card px-5 py-4 no-underline transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#ef4444';
            e.currentTarget.style.boxShadow = '0 0 0 1px #ef444422';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-primary)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <Github size={20} className="text-content-faint" />
          <div>
            <div className="text-sm font-semibold text-content">反馈问题</div>
            <div className="text-xs text-content-faint">在 GitHub 提交 Issue</div>
          </div>
          <ExternalLink size={14} className="ml-auto flex-shrink-0 text-content-faint" />
        </a>
        <a
          href="https://github.com/zza774886285/trek-china"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 overflow-hidden rounded-xl border border-edge bg-surface-card px-5 py-4 no-underline transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.boxShadow = '0 0 0 1px #6366f122';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-primary)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <Github size={20} className="text-content-faint" />
          <div>
            <div className="text-sm font-semibold text-content">源代码</div>
            <div className="text-xs text-content-faint">AGPL v3 · 查看仓库</div>
          </div>
          <ExternalLink size={14} className="ml-auto flex-shrink-0 text-content-faint" />
        </a>
      </div>
    </Section>
  );
}
