import { $, api, escapeHtml, showToast } from '../api.js';

function money(n) {
  return Number(n || 0).toLocaleString('he-IL');
}

export async function renderFinanceCalculator(root) {
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>מחשבון מימון</h1>
        <div class="result-count">הזנה ידנית · שפיצר או בלון (עד 40% ממחירון, עד 60 תשלומים)</div>
      </div>
    </div>

    <section class="panel">
      <div class="form-grid-4">
        <div class="field">
          <label class="field-label">מסלול</label>
          <select id="fc-method" class="select">
            <option value="spitzer" selected>שפיצר</option>
            <option value="balloon">בלון</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">מחירון רכב (₪)</label>
          <input id="fc-list-price" class="input" type="number" min="0" step="1000" value="100000" dir="ltr">
        </div>
        <div class="field">
          <label class="field-label">סכום מימון (₪)</label>
          <input id="fc-finance" class="input" type="number" min="0" step="1000" value="100000" dir="ltr">
        </div>
        <div class="field" id="fc-balloon-wrap" hidden>
          <label class="field-label">אחוז בלון ממחירון (עד 40%)</label>
          <input id="fc-balloon-pct" class="input" type="number" min="0" max="40" step="1" value="40" dir="ltr">
        </div>
        <div class="field">
          <label class="field-label">פריסה (תשלומים)</label>
          <input id="fc-months" class="input" type="number" min="1" max="120" value="60" dir="ltr">
        </div>
        <div class="field">
          <label class="field-label">ריבית שנתית (%)</label>
          <input id="fc-rate" class="input" type="number" min="0" step="0.1" value="9.9" dir="ltr">
        </div>
      </div>

      <div class="actions-row" style="margin-top:1rem">
        <button type="button" class="btn btn-primary" id="fc-calc">חשב</button>
      </div>
      <p class="hint" id="fc-hint" style="margin-top:0.75rem">במסלול בלון: התשלומים החודשיים הם שפיצר על (מימון − בלון), והבלון משולם בסוף התקופה.</p>
    </section>

    <section class="panel" style="margin-top:1rem">
      <h2 class="section-title" style="margin-top:0">תוצאה</h2>
      <div id="fc-result" class="hint">הזן נתונים ולחץ «חשב».</div>
    </section>
  `;

  const methodEl = $('#fc-method');
  const monthsEl = $('#fc-months');
  const balloonWrap = $('#fc-balloon-wrap');

  function syncMethodUi() {
    const balloon = methodEl.value === 'balloon';
    balloonWrap.hidden = !balloon;
    monthsEl.max = balloon ? '60' : '120';
    if (balloon && Number(monthsEl.value) > 60) monthsEl.value = '60';
    $('#fc-hint').textContent = balloon
      ? 'בלון עד 40% ממחירון הרכב (ולא יותר מסכום המימון). עד 60 תשלומי שפיצר על היתרה + בלון בסוף.'
      : 'שפיצר מלא על סכום המימון. פריסה עד 120 תשלומים.';
  }

  function collectBody() {
    return {
      manual: true,
      method: methodEl.value,
      listPrice: Number($('#fc-list-price').value) || 0,
      financeAmount: Number($('#fc-finance').value) || 0,
      months: Number(monthsEl.value) || undefined,
      annualRate: Number($('#fc-rate').value) || 0,
      balloonPercent: Number($('#fc-balloon-pct').value) || 0,
    };
  }

  function renderResult(q) {
    const box = $('#fc-result');
    if (!q) {
      box.innerHTML = '<p class="hint">אין תוצאה.</p>';
      return;
    }

    const balloonRow =
      q.method === 'balloon'
        ? `
      <div class="field">
        <label class="field-label">בלון בסוף התקופה</label>
        <div><strong>₪${escapeHtml(q.balloonDisplay || money(q.balloonAmount))}</strong>
          <span class="hint">(${escapeHtml(String(q.balloonPercent || 0))}% ממחירון)</span></div>
      </div>
      <div class="field">
        <label class="field-label">קרן בשפיצר (מסולקת)</label>
        <div>₪${escapeHtml(q.amortPrincipalDisplay || money(q.amortPrincipal))}</div>
      </div>`
        : `
      <div class="field">
        <label class="field-label">קרן</label>
        <div>₪${escapeHtml(q.principalDisplay || money(q.financeAmount || q.principal))}</div>
      </div>`;

    box.innerHTML = `
      <p style="margin:0 0 0.75rem"><strong>${escapeHtml(q.financeLine || '')}</strong></p>
      <div class="form-grid-4">
        <div class="field">
          <label class="field-label">תשלום חודשי</label>
          <div><strong>₪${escapeHtml(q.monthlyDisplay || money(q.monthlyPayment))}</strong></div>
        </div>
        <div class="field">
          <label class="field-label">מספר תשלומים</label>
          <div>${escapeHtml(String(q.months))}</div>
        </div>
        <div class="field">
          <label class="field-label">ריבית שנתית</label>
          <div>${escapeHtml(String(q.annualRate))}%</div>
        </div>
        ${balloonRow}
        <div class="field">
          <label class="field-label">סה״כ לתשלום</label>
          <div>₪${escapeHtml(q.totalPaidDisplay || money(q.totalPaid))}</div>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label class="field-label">סך הריבית בכל תקופת המימון</label>
          <div><strong style="font-size:1.25rem">₪${escapeHtml(money(q.totalInterest))}</strong></div>
          <p class="hint" style="margin:0.25rem 0 0">סכום הריבית המצטברת על פני כל התשלומים (לא כולל בלון אם קיים כקרן).</p>
        </div>
      </div>
    `;
  }

  async function calculate() {
    try {
      const quote = await api('/api/finance/quote', {
        method: 'POST',
        body: JSON.stringify(collectBody()),
      });
      if (quote.months != null && Number(monthsEl.value) !== Number(quote.months)) {
        monthsEl.value = String(quote.months);
      }
      renderResult(quote);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  methodEl.onchange = () => {
    syncMethodUi();
    calculate();
  };

  ['fc-list-price', 'fc-finance', 'fc-months', 'fc-rate', 'fc-balloon-pct'].forEach((id) => {
    $(`#${id}`).onchange = calculate;
    $(`#${id}`).onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        calculate();
      }
    };
  });

  $('#fc-calc').onclick = calculate;

  syncMethodUi();
  calculate();
}
