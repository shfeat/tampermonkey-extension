// ==UserScript==
// @name         网站图片（背景图，svg，canvas）抓取预览下载
// @namespace    https://github.com/yujinpan/tampermonkey-extension
// @version      2.2
// @license      MIT
// @description  将站点所有的图片（背景图，svg，canvas）抓取提供预览，直接点击下载，批量打包下载。
// @author       yujinpan
// @include      http*://**
// @require      https://cdn.bootcss.com/jszip/3.2.2/jszip.min.js
// ==/UserScript==

/**
 * 已有功能列表：
 * - 抓取页面上的图片链接，包括 **img，背景图，svg，canvas**
 * - 提供展示抓取的图片的列表快速预览
 * - 提供按钮快速切换抓取的图片展示区
 * - 提供快速下载，点击预览即可下载源图片文件
 * - 提供动态抓取后来加载的图片
 *
 * 2019-11-17 更新内容：
 * - **新增【批量下载功能】一键打包下载全部图片**
 *
 * 2019-5-17 更新内容：
 * - 修复 svg，canvas 展示与下载问题
 * - 增加暗黑透明样式，黑色，白色图片区分明显
 * - 重构核心代码，分模块执行，提高可读性与维护性
 * - 兼容 iframe 的 btoa 方法报错
 */

(() => {
  // 存放抓取与生成的图片
  const urls = new Set();

  // 初始化
  init();

  /**
   * 初始化
   */
  function init() {
    // 创建样式
    createStyle();

    // 创建容器
    const section = document.createElement('section');
    section.id = 'SIR';
    section.innerHTML = `
      <button class="SIR-toggle-button SIR-button">自动获取图片</button>
      <div class="SIR-cover"></div>
      <div class="SIR-main-wrap">
          <ul class="SIR-main">
          </ul>
          <div class="SIR-tools">
            <button class="SIR-download-bat-button SIR-button">批量下载</button>
          </div>
          <div class="SIR-download-program"></div>
      </div>
    `;
    document.body.append(section);

    // 获取按钮与列表 DOM
    const button = section.querySelector('.SIR-toggle-button');
    const main = section.querySelector('.SIR-main');
    const downloadBat = section.querySelector('.SIR-download-bat-button');

    // 切换时进行抓取
    let showMain = false;
    button.onclick = () => {
      showMain = !showMain;
      if (showMain) {
        imagesReptile();
        // content
        let imageList = '';
        urls.forEach((url) => {
          imageList += `
            <li>
              <a download="image" title="点击下载" href="${url}">
                <img src='${url}' />
              </a>
            </li>`;
        });
        main.innerHTML = imageList;
      } else {
        main.innerHTML = '';
      }
      section.classList.toggle('active', showMain);
    };
    downloadBat.onclick = downloadAll;
  }

  /**
   * 获取资源列表
   */
  function imagesReptile() {
    const elements = Array.from(document.querySelectorAll('*'));

    let url;
    // 遍历取出 img，backgroundImage，svg，canvas
    for (const element of elements) {
      const tagName = element.tagName.toLowerCase();

      url = '';

      // img 标签
      if (tagName === 'img') {
        try {
          url = getImgUrl(element);
        } catch (e) {
          warnMessage(e);
        }
        url && urls.add(url);
        continue;
      }

      // svg
      if (tagName === 'svg') {
        try {
          url = getSvgImage(element);
        } catch (e) {
          warnMessage(e);
        }
        url && urls.add(url);
        continue;
      }

      // canvas
      if (tagName === 'canvas') {
        try {
          url = getCanvasImage(element);
        } catch (e) {
          warnMessage(e);
        }
        url && urls.add(url);
        continue;
      }

      // background-image
      const backgroundImage = getComputedStyle(element).backgroundImage;
      if (backgroundImage !== 'none' && backgroundImage.startsWith('url')) {
        urls.add(backgroundImage.slice(5, -2));
      }
    }
  }

  /**
   * 创建样式
   */
  function createStyle() {
    const style = document.createElement('style');
    style.innerHTML = `
      #SIR * {
          box-sizing: border-box;
          padding: 0;
          margin: 0;
      }
      #SIR.active .SIR-cover {
          display: block;
      }
      #SIR.active .SIR-main-wrap {
          display: block;
      }
      #SIR .SIR-button {
          padding: 1px 3px;
          opacity: 0.5;
          background: white;
          font-size: 13px;
      }
      #SIR .SIR-button:hover {
          opacity: 1;
      }
      #SIR .SIR-toggle-button {
          position: fixed;
          right: 0;
          bottom: 0;
          z-index: 99999;
      }
      #SIR .SIR-cover,
      #SIR .SIR-main-wrap {
          display: none;
          position: fixed;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
      }
      #SIR .SIR-cover {
          z-index: 99997;
          background: rgba(255, 255, 255, 0.7);
      }
      #SIR .SIR-main-wrap {
          z-index: 99998;
          overflow-y: auto;
          background: rgba(0, 0, 0, 0.7);
      }
      #SIR .SIR-main {
          margin: 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          list-style-type: none;
      }
      #SIR .SIR-main > li {
          box-sizing: border-box;
          width: 10%;
          min-width: 168px;
          min-height: 100px;
          max-height: 200px;
          padding: 1px;
          box-shadow: 0 0 1px white;
          background: rgba(0, 0, 0, 0.5);
          overflow: hidden;
      }
      #SIR .SIR-main > li > a {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          height: 100%;
      }
      #SIR .SIR-main > li:hover img {
          transform: scale(1.5);
      }
      #SIR .SIR-main > li img {
          transition: transform .3s;
          max-width: 100%;
      }
      #SIR .SIR-tools {
          position: fixed;
          bottom: 0;
          right: 100px;
      }
      #SIR .SIR-download-program {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          background-color: inherit;
          border: 1px solid white;
          font-size: 20px;
          display: none;
      }
      #SIR .SIR-download-program.active {
          display: flex;
      }
    `;
    document.head.append(style);
  }

  /**
   * 获取 svg 图片链接
   * @param {Element} svg svg 元素
   */
  function getSvgImage(svg) {
    svg.setAttribute('version', 1.1);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    try {
      return 'data:image/svg+xml;base64,' + btoa(svg.outerHTML);
    } catch (e) {
      warnMessage('svg创建失败');
      return '';
    }
  }

  /**
   * 获取 canvas 图片链接
   * @param {Element} canvas canvas 元素
   */
  function getCanvasImage(canvas) {
    return canvas.toDataURL();
  }

  /**
   * 获取 img 的链接
   * @description
   * 兼容 srcset 属性
   * @param {Element} element 图片元素
   */
  function getImgUrl(element) {
    let url;

    // 兼容 srcset 属性
    if (element.srcset) {
      const srcs = element.srcset.split(',');
      url = srcs.reduce((pre, curr) => {
        curr = curr.trim();
        return curr.includes(' ') ? curr.split(' ')[0] : curr;
      }, '');
    } else {
      url = element.src;
    }

    return url;
  }

  /**
   * 获取链接的图片文件
   * @param url
   * @return {Promise<{file, suffix}>}
   */
  function getImg(url) {
    return new Promise((resolve) => {
      // 如果是链接，就先加载图片，再存文件
      if (/((\.(png|jpg|jpeg|gif|svg)$)|^(http|\/|file))/.test(url)) {
        const request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'blob';
        request.onload = function () {
          let suffix = url.match(/\.[a-zA-Z]+$/);
          suffix = suffix ? suffix[0] : '.png';
          resolve({file: request.response, suffix});
        };
        request.onerror = function (e) {
          warnMessage('图片获取失败', url, e);
          resolve(null);
        };
        request.send();
      } else if (url.includes('base64')) {
        let suffix = '.' + url.replace('data:image/', '').match(/^[a-zA-Z]*/)[0];
        resolve({
          file: dataURLtoFile(url, 'image' + suffix),
          suffix
        });
      } else {
        warnMessage('图片类型无法解析，请联系插件作者', url);
        resolve(null);
      }
    });
  }

  /**
   * 将 base64 转换为文件
   * @param dataUrl
   * @param filename
   * @return {File}
   */
  function dataURLtoFile(dataUrl, filename) {
    let arr = dataUrl.split(','),
      mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]),
      n = bstr.length,
      u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type: mime});
  }

  /**
   * 批量下载所有文件
   */
  function downloadAll() {
    const elem = document.querySelector('.SIR-download-program');
    if (elem && !elem.classList.contains('active')) {
      let total = 0;
      let successCount = 0;
      const promiseArr = Array.from(urls).map((item) => {
        return getImg(item).then(res => {
          successCount++;
          elem.innerHTML = getProgramHTML(successCount, total);
          return res;
        });
      });
      total = promiseArr.length;
      if (total) {
        elem.classList.add('active');
        elem.innerHTML = getProgramHTML(successCount, total);
        Promise.all(promiseArr).then(res => {
          res = res.filter(item => item);
          const zip = new JSZip();
          res.forEach((item, index) => zip.file('image' + index + item.suffix, item.file));
          zip.generateAsync({type: 'blob'})
          .then(function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.download = 'images.zip';
            a.href = url;
            a.click();
            elem.classList.remove('active');
            URL.revokeObjectURL(url);
          });
        }, () => {
          alert('下载失败');
          elem.classList.remove('active');
        });
      } else {
        alert('暂无图片');
      }
    }
  }

  /**
   * 获取下载进度 HTML
   * @param program
   * @param total
   * @return {string}
   */
  function getProgramHTML(program, total) {
    return `<b>${program}</b> / ${total}`;
  }

  /**
   * 警告信息
   * @param params
   */
  function warnMessage(...params) {
    console.warn('[自动获取图片]:', ...params);
  }
})();
