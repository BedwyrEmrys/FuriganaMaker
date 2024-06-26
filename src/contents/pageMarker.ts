import type { PlasmoCSConfig } from 'plasmo';
import type { CSSProperties } from 'react';

import { sendToBackground } from '@plasmohq/messaging';
import { Storage } from '@plasmohq/storage';

import { ExtensionStorage } from './core';
import { addFurigana } from './furiganaMaker';

export const config: PlasmoCSConfig = {
  matches: ['https://*/*'],
};

/* 1. Only the `body` selector may not select any elements before `load` is completed.
   2. Calculating `htmlSize` before `load` is completed will cause the calculated value to be too small. */
window.addEventListener('load', mark);

async function mark() {
  injectCSS();
  const storage = new Storage({ area: 'local' });
  const autoModeIsEnabled: boolean = await storage.get(ExtensionStorage.AutoMode);
  if (!autoModeIsEnabled) {
    /* If the user does not enable the extension, the extension will not attempt to add furigana to the page.
    The page must be refreshed after switching the extension to the enabled state. */
    return;
  }

  const response = await sendToBackground<{ domain: string }, { selector: string }>({
    name: 'getSelector',
    body: { domain: location.hostname },
  });

  if (!response.selector) {
    if (isJapanesePage()){
      console.log('janpanese page auto add furigana');
      response.selector = 'body';
    } else {
      return
    }
  }

  // Reflow on a huge page causes severe page freezes and even the browser becomes unresponsive. (issue#16)
  const encoder = new TextEncoder();
  const utf8Bytes = encoder.encode(document.documentElement.outerHTML);
  const htmlSize = utf8Bytes.length / 1024; // KB
  if (htmlSize > 500) {
    const warningAttrs: CSSProperties = {
      position: 'fixed',
      display: 'flex',
      gap: '10px',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      fontWeight: 'bold',
      color: 'rgb(154,52,18)',
      backgroundColor: 'rgb(255, 247, 237)',
      padding: '15px',
      borderRadius: '10px',
      border: '2px solid rgb(255, 237, 213)',
    };

    const warning = document.createElement('div');
    Object.assign(warning.style, warningAttrs);
    const icon = document.createElement('div');
    icon.textContent = '⚠️';
    const text = document.createElement('span');
    text.textContent = `Warning(Furigana Maker): This page is too large(${htmlSize.toFixed(2)}KB), auto mode is disabled.`;
    warning.appendChild(icon);
    warning.appendChild(text);
    document.body.appendChild(warning);
    setTimeout(() => {
      warning.remove();
    }, 3000);
    return;
  }

  // Observer will not observe the element that is loaded for the first time on the page,
  // so it needs to execute `addFurigana` once immediately.
  const elements = Array.from(document.querySelectorAll(response.selector));
  addFurigana(...elements);

  const observer = new MutationObserver((records) => {
    const japaneseElements = records
      .flatMap((record) => Array.from(record.addedNodes))
      .filter((node) => node.nodeType === Node.ELEMENT_NODE)
      .flatMap((node) => Array.from((node as Element).querySelectorAll(response.selector)));

    addFurigana(...japaneseElements);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function isJapanesePage() {
  // 检查域名是否为 .jp 域名
  const hostname = window.location.hostname;
  if (!hostname.endsWith('.jp')) {
    return false;
  }

  // 检查网页内容 lang 属性
  const lang = document.documentElement.lang;
  if (lang !== 'ja') {
    return false;
  }

  // // 检查网页内容是否包含日语文本
  // const text = document.body.textContent;
  // const jaRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
  // if (!jaRegex.test(text)) {
  //   return false;
  // }

  return true;
}

function injectCSS() {
  const style = document.createElement('style');
  style.textContent = `ruby rb, ruby rt {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }`;
  document.head.appendChild(style);
}