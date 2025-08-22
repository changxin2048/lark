import './style.scss';
import React from 'react';
import { dashboard, DashboardState, IConfig } from "@lark-base-open/js-sdk";
import { Button, Input, Switch, Select, ColorPicker } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef } from 'react';
import { useConfig } from '../../hooks';
import dayjs from 'dayjs';
import classnames from 'classnames'
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next/typescript/t';
// import { ColorPicker } from '../ColorPicker'; // 替换为官方组件
import { Item } from '../Item';

/**
 * 匹配标题输入中的时间样式（yyyy-MM-dd HH:mm:ss），
 * 用于在输入框中将示例时间替换回占位符 {{time}}
 */
const titleDateReg = /\d{4}-\d{1,2}-\d{1,2}\s\d+:\d+:\d{1,2}/

/** 字体选项类型 */
type FontFamilyOption = 'Default' | 'JetBrainsMono' | 'FusionPixel';

/**
 * 工具方法：将 rgb/rgba 字符串转换为十六进制（含 alpha）
 * 例如：rgba(255, 0, 0, 0.5) => #FF000080
 */
function rgbaToHex(rgba: string): string | undefined {
  try {
    const m = rgba.trim().match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/i);
    if (!m) return undefined;
    const r = Math.max(0, Math.min(255, parseInt(m[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(m[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(m[3], 10)));
    const aFloat = m[4] !== undefined ? Math.max(0, Math.min(1, parseFloat(m[4]!))) : 1;
    const a = Math.round(aFloat * 255);
    const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${a === 255 ? '' : toHex(a)}`;
  } catch {
    return undefined;
  }
}

/**
 * 工具方法：解析 CSS 变量（var(--xxx)）为真实颜色十六进制
 * 若解析失败或未定义，则返回原值
 */
function resolveCssVarToHex(value?: string): string | undefined {
  if (!value) return value;
  const varMatch = value.trim().match(/^var\((--[^)]+)\)$/);
  if (!varMatch) {
    if (/^rgb/i.test(value)) return rgbaToHex(value) || value;
    return value;
  }
  const varName = varMatch[1];
  if (typeof window === 'undefined') return value;
  const cssVal = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!cssVal) return value;
  if (cssVal.startsWith('#')) return cssVal.toUpperCase();
  if (/^rgb/i.test(cssVal)) return rgbaToHex(cssVal) || value;
  return value;
}

/**
 * 工具方法：标准化颜色值为十六进制（含 alpha），无法转换则原样返回
 */
function normalizeColor(value?: string): string | undefined {
  if (!value) return value;
  const v = value.trim();
  if (v.startsWith('#')) return v.toUpperCase();
  if (/^rgb/i.test(v)) return rgbaToHex(v) || v;
  return resolveCssVarToHex(v) || v;
}

/**
 * 获取主题预设色（沿用 var(--ccm-chart-*) 集合），转换为十六进制供官方 ColorPicker 使用
 */
function getThemePresetHexes(): string[] {
  const vars = [
    '--ccm-chart-N700',
    '--ccm-chart-B500',
    '--ccm-chart-I500',
    '--ccm-chart-G500',
    '--ccm-chart-W500',
    '--ccm-chart-Y500',
    '--ccm-chart-O500',
    '--ccm-chart-R400',
  ];
  return vars.map(v => normalizeColor(`var(${v})`) || '#000000');
}

/**
 * 尝试从官方 ColorPicker 的 onChange 参数中提取十六进制颜色
 * 兼容 string / 含 toHexString 方法 / 带 hex 属性的对象
 */
function coerceColor(val: any): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return normalizeColor(val);
  if (typeof val.toHexString === 'function') return normalizeColor(val.toHexString());
  if (typeof val.toHex === 'function') return normalizeColor(val.toHex());
  if (typeof val.hex === 'string') return normalizeColor(val.hex);
  return undefined;
}

/**
 * 配置接口：颜色、标题与时间格式模板
 */
interface ICountDownConfig {
  /** 文本颜色（统一存储为 hex/hex8） */
  color: string;
  /** 标题模板，支持 {{time}} 占位符 */
  title: string,
  /** 是否展示标题 */
  showTitle: boolean,
  /** Dayjs 格式模板，例如：YYYY/MM/DD HH:mm:ss */
  format: string,
  /** 背景颜色（统一存储为 hex/hex8；未设置则回退到外部 props.bgColor） */
  backgroundColor?: string,
  /** 字体选择（仅作用于时间文本） */
  fontFamily?: FontFamilyOption,
}

/**
 * 将旧配置迁移为新配置
 * - 默认格式：YYYY/MM/DD HH:mm:ss
 * - 颜色：若为 CSS 变量或 rgb(a)，则解析并统一存储为 hex/hex8
 * - 背景色：同上；未配置时由渲染处回退到外部 props.bgColor
 * - 字体：透传旧配置的 fontFamily，默认 Default
 */
function migrateConfig(input: any): ICountDownConfig {
  const DEFAULT_FORMAT = 'YYYY/MM/DD HH:mm:ss';
  const base: ICountDownConfig = {
    color: normalizeColor(input?.color || 'var(--ccm-chart-N700)') || '#000000',
    title: input?.title || 'Current time {{time}}',
    showTitle: typeof input?.showTitle === 'boolean' ? input.showTitle : false,
    format: input?.format || DEFAULT_FORMAT,
    backgroundColor: normalizeColor(input?.backgroundColor),
    fontFamily: (input?.fontFamily as FontFamilyOption) || 'Default',
  };
  if (!input?.format) {
    const withoutSec = input?.showSeconds === false;
    const withWeek = input?.showWeekday === true;
    let fmt = withoutSec ? 'YYYY/MM/DD HH:mm' : 'YYYY/MM/DD HH:mm:ss';
    if (withWeek) fmt += ' dddd';
    base.format = fmt;
  }
  return base;
}

/**
 * 仪表盘主组件：读取配置、处理保存、渲染时钟视图与配置面板
 */
export default function CountDown(props: { bgColor: string }) {

  const { t, i18n } = useTranslation();

  const DEFAULT_FORMAT = 'YYYY/MM/DD HH:mm:ss';

  // create时的默认配置
  const [config, setConfig] = useState<ICountDownConfig>({
    color: normalizeColor('var(--ccm-chart-N700)') || '#000000',
    title: t('target.remain'),
    showTitle: false,
    format: DEFAULT_FORMAT,
    fontFamily: 'Default',
  })

  // 是否配置/创建模式下
  const isCreate = dashboard.state === DashboardState.Create

  useEffect(() => {
    if (isCreate) {
      setConfig({
        color: normalizeColor('var(--ccm-chart-N700)') || '#000000',
        title: t('target.remain'),
        showTitle: false,
        format: DEFAULT_FORMAT,
        fontFamily: 'Default',
      })
    }
  }, [i18n.language, isCreate])

  /** 是否配置/创建模式下 */
  const isConfig = dashboard.state === DashboardState.Config || isCreate;

  const timer = useRef<any>()

  /**
   * 配置变更回调：同步仪表盘配置并在渲染后通知宿主
   */
  const updateConfig = (res: IConfig) => {
    if (timer.current) {
      clearTimeout(timer.current)
    }
    const { customConfig } = res;
    if (customConfig) {
      setConfig(migrateConfig(customConfig));
      timer.current = setTimeout(() => {
        // 自动化发送截图。预留3s给浏览器进行渲染，3s后告知服务端可以进行截图了（对域名进行了拦截，此功能仅上架部署后可用）。
        dashboard.setRendered();
      }, 3000);
    }
  }

  useConfig(updateConfig)

  return (
    <main style={{backgroundColor: config.backgroundColor || props.bgColor}} className={classnames({'main-config': isConfig, 'main': true})}>
      <div className='content'>
        <CountdownView
          t={t}
          config={config}
          isConfig={isConfig}
        />
      </div>
      {
        isConfig && <ConfigPanel t={t} config={config} setConfig={setConfig} />
      }
    </main>
  )
}


interface ICountdownView {
  config: ICountDownConfig,
  isConfig: boolean,
  t: TFunction<"translation", undefined>,
}

/**
 * 时钟展示组件：每秒刷新，使用 format 模板格式化当前时间
 */
function CountdownView({ config, isConfig, t }: ICountdownView) {
  const { color, title } = config;
  const [now, setNow] = useState(formatNow(config));

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(formatNow(config));
    }, 1000);
    return () => clearInterval(timer);
  }, [config.format]);

  return (
    <div style={{ width: '100vw', textAlign: 'center', overflow: 'hidden', color }}>
      {config.showTitle ? (
        <p className={classnames('count-down-title', { 'count-down-title-config': isConfig })}>
          {title.replaceAll(/\{\{\s*time\s*\}\}/g, now)}
        </p>
      ) : null}
      <div style={{ fontSize: 56, fontWeight: 700, fontFamily: getFontFamilyValue(config.fontFamily) }}>{now}</div>
    </div>
  );
}


/**
 * 配置面板：标题模板、是否显示标题、格式模板、颜色选择，以及保存配置
 */
function ConfigPanel(props: {
  config: ICountDownConfig,
  setConfig: React.Dispatch<React.SetStateAction<ICountDownConfig>>,
  t: TFunction<"translation", undefined>,
}) {
  const { config, setConfig, t } = props;

  /**保存配置 */
  const onSaveConfig = () => {
    dashboard.saveConfig({
      customConfig: config,
      dataConditions: [],
    } as any)
  }

  // 当前格式化时间，用于标题输入框的临时展示替换
  const nowStr = formatNow(config);
  const DEFAULT_FORMAT = 'YYYY/MM/DD HH:mm:ss';

  // 预设主题色（十六进制）
  const presetColors = getThemePresetHexes();

  return (
    <div className='config-panel'>
      <div className='form'>
        <Item label={
          <div className='label-checkbox'>
            {t('label.display.time')}
            <Switch
              checked={config.showTitle}
              onChange={(e) => {
                setConfig({
                  ...config,
                  showTitle: e ?? false
                })
              }} ></Switch>
          </div>
        }>
          <Input
            disabled={!config.showTitle}
            value={config.title.replaceAll(/\{\{\s*time\s*\}\}/g, nowStr)}
            onChange={(v) => setConfig({
              ...config,
              title: v.replaceAll(nowStr, '{{time}}')
            })}
            onBlur={(e) => {
              setConfig({
                ...config,
                title: e.target.value.replaceAll(nowStr, '{{time}}'),
              })
            }} />
        </Item>

        <Item label={t('label.format')}>
          <Input
            placeholder={t('format.placeholder')}
            value={config.format}
            onChange={(v) => setConfig({ ...config, format: v })}
            onBlur={(e) => setConfig({ ...config, format: e.target.value || DEFAULT_FORMAT })}
          />
        </Item>

        <Item label={t("label.color")}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ColorPicker
              alpha
              value={config.color as any}
              onChange={(v: any) => {
                const hex = coerceColor(v);
                if (!hex) return;
                setConfig({ ...config, color: hex });
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {presetColors.map((c, idx) => (
                <span
                  key={`preset-text-${idx}`}
                  title={c}
                  onClick={() => setConfig({ ...config, color: c })}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    border: '1px solid var(--semi-color-border)',
                    background: c,
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
          </div>
        </Item>

        {/* 字体选择：仅作用于时间文本 */}
        <Item label={t('label.fontFamily')}>
          <Select
            value={config.fontFamily || 'Default'}
            onChange={(v) => setConfig({ ...config, fontFamily: v as FontFamilyOption })}
          >
            <Select.Option value={'Default'}>{t('font.default')}</Select.Option>
            <Select.Option value={'JetBrainsMono'}>{t('font.jetbrainsMono')}</Select.Option>
            <Select.Option value={'FusionPixel'}>{t('font.fusionPixel')}</Select.Option>
          </Select>
        </Item>

        {/* 背景颜色（支持 alpha），并提供清空回退到外部 props.bgColor */}
        <Item label={t('label.background')}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ColorPicker
              alpha
              value={(config.backgroundColor || '') as any}
              onChange={(v: any) => {
                const hex = coerceColor(v);
                if (!hex) return;
                setConfig({ ...config, backgroundColor: hex });
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {presetColors.map((c, idx) => (
                <span
                  key={`preset-bg-${idx}`}
                  title={c}
                  onClick={() => setConfig({ ...config, backgroundColor: c })}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    border: '1px solid var(--semi-color-border)',
                    background: c,
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
            <Button size='small' onClick={() => setConfig({ ...config, backgroundColor: undefined })}>
              {t('action.clear')}
            </Button>
          </div>
        </Item>
      </div>

      <Button
        className='btn'
        theme='solid'
        onClick={onSaveConfig}
      >
        {t('confirm')}
      </Button>
    </div>
  )
}

/**
 * 格式化当前系统时间：基于用户自定义 Dayjs 模板
 */
function formatNow(config: Pick<ICountDownConfig, 'format'>) {
  const fmt = config.format || 'YYYY/MM/DD HH:mm:ss';
  return dayjs().format(fmt);
}


/**
 * 根据配置返回可用的 CSS font-family 字符串
 * - Default：不指定（由环境/主题决定）
 * - JetBrainsMono：使用 'JetBrainsMono', monospace
 * - FusionPixel：使用 'FusionPixel', sans-serif
 */
function getFontFamilyValue(fontFamily?: FontFamilyOption): string | undefined {
  if (!fontFamily || fontFamily === 'Default') return undefined;
  if (fontFamily === 'JetBrainsMono') return `'JetBrainsMono', monospace`;
  if (fontFamily === 'FusionPixel') return `'FusionPixel', sans-serif`;
  return undefined;
}