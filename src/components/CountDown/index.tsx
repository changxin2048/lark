import './style.scss';
import React from 'react';
import { dashboard, DashboardState, IConfig } from "@lark-base-open/js-sdk";
import { Button, Input, Switch } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef } from 'react';
import { useConfig } from '../../hooks';
import dayjs from 'dayjs';
import classnames from 'classnames'
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next/typescript/t';
import { ColorPicker } from '../ColorPicker';
import { Item } from '../Item';

/**
 * 匹配标题输入中的时间样式（yyyy-MM-dd HH:mm:ss），
 * 用于在输入框中将示例时间替换回占位符 {{time}}
 */
const titleDateReg = /\d{4}-\d{1,2}-\d{1,2}\s\d+:\d+:\d{1,2}/

/**
 * 配置接口：颜色、标题与时间格式模板
 */
interface ICountDownConfig {
  /** 文本颜色（继承主题色变量） */
  color: string;
  /** 标题模板，支持 {{time}} 占位符 */
  title: string,
  /** 是否展示标题 */
  showTitle: boolean,
  /** Dayjs 格式模板，例如：YYYY/MM/DD HH:mm:ss */
  format: string,
  /** 背景颜色；为空时回退到宿主传入的 props.bgColor，支持 'transparent' */
  backgroundColor?: string,
}

/**
 * 将旧配置（含 showSeconds/showWeekday）迁移为新配置（format）
 * - 默认格式：YYYY/MM/DD HH:mm:ss
 * - 若旧配置 showSeconds=false，则去掉 :ss
 * - 若旧配置 showWeekday=true，则在末尾追加空格 + dddd
 */
function migrateConfig(input: any): ICountDownConfig {
  const DEFAULT_FORMAT = 'YYYY/MM/DD HH:mm:ss';
  const base: ICountDownConfig = {
    color: input?.color || 'var(--ccm-chart-N700)',
    title: input?.title || 'Current time {{time}}',
    showTitle: typeof input?.showTitle === 'boolean' ? input.showTitle : false,
    format: input?.format || DEFAULT_FORMAT,
    /** 背景颜色：支持透明，默认为空表示使用宿主 props */
    backgroundColor: input?.backgroundColor || '',
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
    color: 'var(--ccm-chart-N700)',
    title: t('target.remain'),
    showTitle: false,
    format: DEFAULT_FORMAT,
    /** 默认不设置背景色，回退到宿主 props */
    backgroundColor: '',
  })

  // 是否配置/创建模式下
  const isCreate = dashboard.state === DashboardState.Create

  useEffect(() => {
    if (isCreate) {
      setConfig({
        color: 'var(--ccm-chart-N700)',
        title: t('target.remain'),
        showTitle: false,
        format: DEFAULT_FORMAT,
        /** 默认不设置背景色，回退到宿主 props */
        backgroundColor: '',
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
    <main style={{backgroundColor: (config.backgroundColor || props.bgColor)}} className={classnames({'main-config': isConfig, 'main': true})}>
      <div className='content'>
        <CountdownView
          t={t}
          config={config}
          isConfig={isConfig}
        />
      </div>
      {
          isConfig && <ConfigPanel t={t} config={config} setConfig={setConfig} bgColor={props.bgColor} />
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
      <div style={{ fontSize: 56, fontWeight: 700 }}>{now}</div>
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
  /** 宿主传入的背景色，用作回退展示 */
  bgColor: string,
}) {
  const { config, setConfig, t, bgColor } = props;

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
          <ColorPicker value={config.color} onChange={(v) => {
            setConfig({
              ...config,
              color: v,
            })
          }}></ColorPicker>
        </Item>

        {/** 背景色选择：优先级覆盖外部 props，支持透明 */}
        <Item label={t('label.background')}>
          <ColorPicker
            value={(config.backgroundColor && config.backgroundColor !== 'transparent') ? config.backgroundColor : bgColor}
            onChange={(v) => {
              setConfig({
                ...config,
                backgroundColor: config.backgroundColor === 'transparent' ? 'transparent' : v,
              })
            }}
          ></ColorPicker>
        </Item>

        {/** 透明背景开关：打开时 backgroundColor 固定为 'transparent'；关闭时回退为空以继承宿主背景 */}
        <Item label={
          <div className='label-checkbox'>
            {t('label.transparentBackground')}
            <Switch
              checked={config.backgroundColor === 'transparent'}
              onChange={(e) => {
                setConfig({
                  ...config,
                  backgroundColor: e ? 'transparent' : ''
                })
              }} ></Switch>
          </div>
        }>
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