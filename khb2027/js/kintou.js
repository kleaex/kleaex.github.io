   // 縦書き自動調整機能
    window.applyVerticalLayout = (elementId, containerHeight) => {
      const element = document.getElementById(elementId);
      if (!element) {
        console.warn(`Element with id "${elementId}" not found`);
        return;
      }

      // 縦書きクラスを追加
      element.classList.add('auto-vertical');
      
      // コンテナの高さを設定（指定がない場合は親要素の高さを使用）
      const availableHeight = containerHeight || element.parentElement.clientHeight;
      
      // 文字列から改行を取り、前後空白は削る
      const text = element.textContent.replace(/\r?\n/g, '').trim();
      
      // 初期化
      element.style.letterSpacing = '0px';
      element.style.transform = 'none';
      
      // 文字数（サロゲートペア対応）
      const charCount = Array.from(text).length;
      
      // 現在（字間0・スケール無し）の高さ
      const naturalHeight = element.getBoundingClientRect().height;
      
      if (naturalHeight > availableHeight + 0.5) {
        // はみ出し → 縦方向に圧縮（扁平）
        const scale = availableHeight / naturalHeight;
        element.style.transform = `scaleY(${scale})`;
      } else {
        // 余り → letter-spacing で上下端ぴったり
        if (charCount > 1) {
          const gaps = charCount - 1;
          let spacing = (availableHeight - naturalHeight) / gaps;
          element.style.letterSpacing = `${spacing}px`;
          
          // 反映後の微調整（丸め誤差対応）
          const adjustedHeight = element.getBoundingClientRect().height;
          if (Math.abs(adjustedHeight - availableHeight) > 0.5 && adjustedHeight > 0) {
            const adjust = availableHeight / adjustedHeight;
            spacing = spacing * adjust;
            element.style.letterSpacing = `${spacing}px`;
          }
        }
      }
    };

    // 俳句欄の自動調整を適用する関数
    window.applyHaikuLayout = () => {
      // 各俳句欄のIDに対して自動調整を適用
      const haikuElements = [
        'k1_1', 'k1_3', 'k1_5',
        'k2_1', 'k2_3', 'k2_5', 
        'k3_1', 'k3_3', 'k3_5',
        'k4_1', 'k4_2', 'k4_3', 'k4_4', 'k4_5',
        'teamName'
      ];
      
      haikuElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element && element.textContent.trim()) {
          // コンテナの高さを計算（親要素の高さから余白を除く）
          const parent = element.closest('.left2, .right2');
          if (parent) {
            const parentHeight = parent.clientHeight;
            const h3Height = parent.querySelector('h3').offsetHeight;
            const availableHeight = parentHeight - h3Height - 40; // 40pxは余白
            applyVerticalLayout(elementId, availableHeight);
          }
        }
      });
    };

    // ページ読み込み後に自動調整を適用
    document.addEventListener('DOMContentLoaded', () => {
      // 初回実行
      setTimeout(applyHaikuLayout, 100);
      
      // 俳句欄のテキスト変更を監視
      const haikuElements = [
        'k1_1', 'k1_3', 'k1_5',
        'k2_1', 'k2_3', 'k2_5', 
        'k3_1', 'k3_3', 'k3_5',
        'k4_1', 'k4_2', 'k4_3', 'k4_4', 'k4_5',
        'teamName'
      ];
      
      // 各要素にMutationObserverを設定
      haikuElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
          const observer = new MutationObserver(() => {
            setTimeout(() => applyVerticalLayout(elementId, getAvailableHeight(element)), 50);
          });
          observer.observe(element, { childList: true, characterData: true, subtree: true });
        }
      });
      
      // 定期的に再調整（フォールバック）
      setInterval(applyHaikuLayout, 1000);
    });
    
    // 利用可能な高さを計算する補助関数
    function getAvailableHeight(element) {
      const parent = element.closest('.left2, .right2');
      if (parent) {
        const parentHeight = parent.clientHeight;
        const h3 = parent.querySelector('h3');
        const h3Height = h3 ? h3.offsetHeight : 0;
        return parentHeight - h3Height - 40; // 40pxは余白
      }
      return 200; // デフォルト値
    }
