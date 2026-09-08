'use strict';
(() => {
    const OS = Aster, $ = OS.$, esc = OS.esc;
    const ib = (icon, label, fn) => OS.el('button', { class: 'icon-button', title: label, 'aria-label': label, html: OS.icon(icon, 18), onclick: OS.guard(fn) });
    // A deliberately small arithmetic parser. No eval, Function, or code execution.
    OS.calculate = (source, degrees = true) => {
        let text = String(source).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/\s/g, '');
        if (text.length > 500)
            throw Error('Expression is too long.');
        let tokens = [], offset = 0;
        while (offset < text.length) {
            const rest = text.slice(offset), number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i), name = rest.match(/^[a-z]+/i);
            if (number) {
                tokens.push({ type: 'number', value: Number(number[0]) });
                offset += number[0].length;
            }
            else if (name) {
                tokens.push({ type: 'name', value: name[0].toLowerCase() });
                offset += name[0].length;
            }
            else if ('+-*/^()!%'.includes(rest[0])) {
                tokens.push({ type: rest[0], value: rest[0] });
                offset++;
            }
            else
                throw Error('Unsupported character: ' + rest[0]);
        }
        const constants = { pi: Math.PI, e: Math.E };
        const functions = { sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, sin: x => Math.sin(x * (degrees ? Math.PI / 180 : 1)), cos: x => Math.cos(x * (degrees ? Math.PI / 180 : 1)), tan: x => Math.tan(x * (degrees ? Math.PI / 180 : 1)) };
        const expanded = [];
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i], prev = tokens[i - 1];
            if (prev && (prev.type === 'number' || prev.type === ')' || prev.type === '!' || prev.type === '%' || prev.type === 'name' && Object.hasOwn(constants, prev.value)) && (t.type === '(' || t.type === 'name' || t.type === 'number'))
                expanded.push({ type: '*' });
            expanded.push(t);
        }
        tokens = expanded;
        let i = 0, depth = 0;
        const eat = t => tokens[i]?.type === t ? (i++, true) : false;
        const expression = () => { let v = term(); while (i < tokens.length) {
            if (eat('+'))
                v += term();
            else if (eat('-'))
                v -= term();
            else
                break;
        } return v; };
        const term = () => { let v = unary(); while (i < tokens.length) {
            if (eat('*'))
                v *= unary();
            else if (eat('/')) {
                const divisor = unary();
                if (divisor === 0)
                    throw Error('Cannot divide by zero');
                v /= divisor;
            }
            else
                break;
        } return v; };
        const unary = () => { if (++depth > 70)
            throw Error('Expression nesting is too deep.'); let result; if (eat('+'))
            result = unary();
        else if (eat('-'))
            result = -unary();
        else
            result = power(); depth--; return result; };
        const power = () => { let v = postfix(); if (eat('^'))
            v = Math.pow(v, unary()); return v; };
        const postfix = () => { let v = primary(); while (true) {
            if (eat('%'))
                v /= 100;
            else if (eat('!')) {
                if (!Number.isInteger(v) || v < 0 || v > 170)
                    throw Error('Factorial needs an integer from 0 to 170.');
                let f = 1;
                for (let n = 2; n <= v; n++)
                    f *= n;
                v = f;
            }
            else
                break;
        } return v; };
        const primary = () => { const token = tokens[i++]; if (!token)
            throw Error('Complete the expression'); if (token.type === 'number')
            return token.value; if (token.type === '(') {
            const v = expression();
            if (!eat(')'))
                throw Error('Missing closing parenthesis');
            return v;
        } if (token.type === 'name') {
            if (Object.hasOwn(constants, token.value))
                return constants[token.value];
            const fn = Object.hasOwn(functions, token.value) ? functions[token.value] : null;
            if (!fn)
                throw Error('Unknown function: ' + token.value);
            if (!eat('('))
                throw Error('Use parentheses after a function');
            const v = expression();
            if (!eat(')'))
                throw Error('Missing closing parenthesis');
            return fn(v);
        } throw Error('Unexpected token'); };
        if (!tokens.length)
            return 0;
        const result = expression();
        if (i !== tokens.length)
            throw Error('Unexpected token');
        if (!Number.isFinite(result))
            throw Error('Result is not a finite real number');
        return Number(result.toPrecision(14));
    };
    OS.register('calculator', { title: 'Calculator', description: 'Everyday math, with room for the complicated.', category: 'Utilities', width: 565, height: 595, minWidth: 315, minHeight: 470,
        mount: async (w) => {
            let expression = w.state.expression || '', previous = '', evaluated = false, memory = 0, scientific = false, degrees = true, history = await OS.db.get('calcHistory') || [];
            const menu = OS.el('div', { class: 'menu-bar' }), layout = OS.el('div', { class: 'calc' }), main = OS.el('div', { class: 'calc-main' }), historyPane = OS.el('aside', { class: 'calc-history' }), display = OS.el('div', { class: 'calc-display' }), expr = OS.el('div', { class: 'calc-expression' }), value = OS.el('div', { class: 'calc-value', text: '0', 'aria-live': 'polite' }), mem = OS.el('div', { class: 'calc-memory' }), science = OS.el('div', { class: 'science-row', hidden: true }), keys = OS.el('div', { class: 'calc-keys' });
            display.append(expr, value);
            main.append(display, mem, science, keys);
            layout.append(main, historyPane);
            w.body.append(menu, layout);
            const render = () => { expr.textContent = previous; value.textContent = expression || '0'; value.style.fontSize = expression.length > 18 ? '23px' : expression.length > 12 ? '32px' : '42px'; w.state.expression = expression; OS.saveSession(); };
            const current = () => OS.calculate(expression || '0', degrees);
            const renderHistory = () => { historyPane.replaceChildren(OS.el('div', { class: 'row' }, OS.el('h3', { text: 'History', style: 'margin:0;flex:1' }), ib('trash', 'Clear history', async () => { history = []; await OS.db.set('calcHistory', history); renderHistory(); }))); if (!history.length)
                historyPane.append(OS.el('p', { class: 'muted', text: 'Your calculations will appear here.', style: 'font-size:11px;line-height:1.7;margin-top:22px' })); for (const h of history.slice(0, 25))
                historyPane.append(OS.el('button', { html: `<small>${esc(h.expression)} =</small><strong>${esc(h.result)}</strong>`, onclick: () => { expression = String(h.result); previous = h.expression + ' ='; evaluated = true; render(); } })); };
            const calculate = () => { try {
                const old = expression || '0', result = current();
                expression = String(result);
                previous = old + ' =';
                evaluated = true;
                history.unshift({ expression: old, result });
                history = history.slice(0, 30);
                OS.db.set('calcHistory', history);
                renderHistory();
                render();
            }
            catch (e) {
                value.textContent = e.message;
                value.style.fontSize = '20px';
                evaluated = true;
            } };
            const insert = s => { if (expression.length > 400)
                return; if (evaluated && !/^[+\-*/^]$/.test(s)) {
                expression = '';
                previous = '';
            } evaluated = false; expression += s; render(); };
            const action = k => { if (k === '=') {
                calculate();
                return;
            } if (k === 'C') {
                expression = '';
                previous = '';
                evaluated = false;
                render();
                return;
            } if (k === 'CE') {
                expression = expression.replace(/(?:\d*\.?\d+|[a-z]+)\)?$/i, '');
                evaluated = false;
                render();
                return;
            } if (k === 'back') {
                expression = expression.slice(0, -1);
                evaluated = false;
                render();
                return;
            } if (k === 'sign') {
                if (!expression || expression === '0')
                    return;
                try {
                    expression = String(-current());
                    evaluated = false;
                    render();
                }
                catch {
                    insert('-');
                }
                return;
            } if (k === 'sqrt') {
                expression = 'sqrt(' + (expression || '0') + ')';
                calculate();
                return;
            } if (k === 'square') {
                expression = '(' + (expression || '0') + ')^2';
                calculate();
                return;
            } if (k === 'reciprocal') {
                expression = '1/(' + (expression || '0') + ')';
                calculate();
                return;
            } if (k === '%') {
                const m = expression.match(/^(.*)([+-])(\d*\.?\d+)$/);
                if (m) {
                    try {
                        expression = m[1] + m[2] + (OS.calculate(m[1], degrees) * Number(m[3]) / 100);
                        render();
                        return;
                    }
                    catch { }
                }
                insert('%');
                return;
            } insert(k); };
            const modeB = OS.el('button', { text: 'Standard', style: 'font-size:17px;font-weight:600', onclick: () => { scientific = !scientific; science.hidden = !scientific; modeB.textContent = scientific ? 'Scientific' : 'Standard'; } }), angleB = OS.el('button', { text: 'DEG', title: 'Toggle degrees/radians', onclick: () => { degrees = !degrees; angleB.textContent = degrees ? 'DEG' : 'RAD'; } });
            menu.append(ib('list', 'Toggle scientific mode', () => modeB.click()), modeB, OS.el('span', { class: 'spacer' }), angleB, ib('copy', 'Copy result', async () => { if (!navigator.clipboard)
                throw Error('Clipboard is unavailable in this context.'); await navigator.clipboard.writeText(expression || '0'); OS.notify('Copied', 'Calculator value copied to your clipboard.'); }));
            for (const name of ['MC', 'MR', 'M+', 'M−', 'MS']) {
                const b = OS.el('button', { text: name, onclick: OS.guard(() => { if (name === 'MC')
                        memory = 0; if (name === 'MR') {
                        expression = String(memory);
                        evaluated = true;
                        render();
                    } if (name === 'M+')
                        memory += current(); if (name === 'M−')
                        memory -= current(); if (name === 'MS')
                        memory = current(); mem.title = 'Memory: ' + memory; }) });
                mem.append(b);
            }
            for (const [label, s] of [['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['ln', 'ln('], ['log', 'log('], ['(', '('], [')', ')'], ['π', 'pi'], ['xʸ', '^'], ['n!', '!']])
                science.append(OS.el('button', { text: label, onclick: () => insert(s) }));
            const specs = [['%', '%'], ['CE', 'CE'], ['C', 'C'], ['⌫', 'back'], ['¹⁄ₓ', 'reciprocal'], ['x²', 'square'], ['√x', 'sqrt'], ['÷', '/'], ['7', '7'], ['8', '8'], ['9', '9'], ['×', '*'], ['4', '4'], ['5', '5'], ['6', '6'], ['−', '-'], ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+'], ['+/−', 'sign'], ['0', '0'], ['.', '.'], ['=', '=']];
            specs.forEach(([label, k], i) => keys.append(OS.el('button', { class: 'calc-key' + (i < 8 ? ' utility' : '') + (k === '=' ? ' equals' : ''), text: label, 'aria-label': k === 'back' ? 'Backspace' : label, onclick: () => action(k) })));
            w.onKey = e => { if (e.ctrlKey || e.altKey || e.metaKey)
                return; if (/^[0-9.+\-*/^()%!]$/.test(e.key)) {
                e.preventDefault();
                action(e.key);
            }
            else if (e.key === 'Enter' || e.key === '=') {
                e.preventDefault();
                calculate();
            }
            else if (e.key === 'Backspace') {
                e.preventDefault();
                action('back');
            }
            else if (e.key === 'Escape') {
                action('C');
            }
            else if (e.key === 'Delete') {
                action('CE');
            } };
            w.calculate = OS.calculate;
            renderHistory();
            render();
        }
    });
    OS.isoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    OS.calendarDays = date => { const first = new Date(date.getFullYear(), date.getMonth(), 1), offset = (first.getDay() + 6) % 7; return Array.from({ length: 42 }, (_, i) => new Date(date.getFullYear(), date.getMonth(), i - offset + 1)); };
    OS.register('calendar', { title: 'Calendar', description: 'A little more intention for your days.', category: 'Productivity', width: 955, height: 665, minWidth: 470, singleton: true,
        mount: async (w, options) => {
            let month = options.date ? new Date(options.date + 'T12:00') : new Date(), selected = OS.isoDate(month), events = await OS.db.get('calendarEvents') || [];
            const layout = OS.el('div', { class: 'calendar-app' }), main = OS.el('div', { class: 'calendar-main' }), agenda = OS.el('aside', { class: 'calendar-agenda' });
            layout.append(main, agenda);
            w.body.append(layout);
            const save = async () => { await OS.db.set('calendarEvents', events); OS.emit('calendar-change'); render(); };
            const editEvent = async (existing = null) => {
                const extra = OS.el('div', { class: 'event-form' }), date = OS.el('input', { type: 'date', value: existing?.date || selected, 'aria-label': 'Event date' }), time = OS.el('input', { type: 'time', value: existing?.time || '09:00', 'aria-label': 'Event time' }), notes = OS.el('textarea', { rows: 3, placeholder: 'Notes', text: existing?.notes || '', 'aria-label': 'Event notes' }), reminder = OS.el('input', { type: 'checkbox', checked: existing?.reminder || false, 'aria-label': 'Remind me in Aster' });
                extra.append(OS.el('label', { text: 'Date' }), date, OS.el('label', { text: 'Time' }), time, notes, OS.el('label', { class: 'row' }, reminder, OS.el('span', { text: 'Remind me while Aster is open', style: 'font-size:11px' })));
                const title = await OS.dialog({ title: existing ? 'Edit event' : 'New event', message: 'This calendar is local to Aster. It does not sync with an online account.', value: existing?.title || '', placeholder: 'Event title', extra, confirm: 'Save event' });
                if (title === null)
                    return;
                if (!title.trim())
                    throw Error('Give the event a title.');
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value) || !time.value)
                    throw Error('Choose a valid date and time.');
                const event = { id: existing?.id || OS.uid(), title: title.trim().slice(0, 150), date: date.value, time: time.value, notes: notes.value, reminder: reminder.checked };
                if (existing)
                    events = events.map(e => e.id === existing.id ? event : e);
                else
                    events.push(event);
                selected = date.value;
                month = new Date(selected + 'T12:00');
                await save();
            };
            const render = () => { main.replaceChildren(); const heading = OS.el('div', { class: 'row' }), title = OS.el('h2', { text: month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), style: 'margin:0;flex:1' }); heading.append(title, OS.el('button', { class: 'secondary', text: 'Today', onclick: () => { month = new Date(); selected = OS.isoDate(month); render(); } }), ib('back', 'Previous month', () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); render(); }), ib('forward', 'Next month', () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); render(); })); main.append(heading); const grid = OS.el('div', { class: 'calendar-app-grid', role: 'grid', 'aria-label': 'Month calendar' }); for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
                grid.append(OS.el('div', { class: 'weekday', text: day })); const today = OS.isoDate(new Date()); for (const date of OS.calendarDays(month)) {
                const iso = OS.isoDate(date), cell = OS.el('button', { class: 'calendar-day' + (date.getMonth() !== month.getMonth() ? ' outside' : '') + (iso === today ? ' today' : '') + (iso === selected ? ' selected' : ''), 'aria-label': date.toDateString(), role: 'gridcell', 'aria-selected': String(iso === selected) });
                cell.append(OS.el('span', { class: 'day-number', text: String(date.getDate()) }));
                for (const event of events.filter(e => e.date === iso).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 3))
                    cell.append(OS.el('span', { class: 'calendar-event-dot', text: event.time + ' ' + event.title }));
                cell.onclick = () => { selected = iso; render(); };
                cell.ondblclick = OS.guard(() => editEvent());
                grid.append(cell);
            } main.append(grid); renderAgenda(); };
            const renderAgenda = () => { agenda.replaceChildren(); const date = new Date(selected + 'T12:00'); agenda.append(OS.el('div', { class: 'eyebrow', text: date.toLocaleDateString(undefined, { weekday: 'long' }) }), OS.el('h2', { text: date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }), style: 'margin:8px 0 20px' }), OS.el('button', { class: 'primary', html: OS.icon('plus', 16) + 'New event', onclick: OS.guard(() => editEvent()) })); const list = events.filter(e => e.date === selected).sort((a, b) => a.time.localeCompare(b.time)); if (!list.length)
                agenda.append(OS.el('p', { class: 'muted', text: 'Nothing planned. A little room in your day.', style: 'font-size:12px;line-height:1.7;margin-top:25px' })); for (const event of list) {
                const card = OS.el('div', { class: 'event-card' });
                card.append(OS.el('strong', { text: event.title }), OS.el('small', { text: event.time + (event.reminder ? ' · Reminder on' : '') }));
                if (event.notes)
                    card.append(OS.el('p', { text: event.notes, style: 'font-size:11px;white-space:pre-wrap;margin:9px 0;color:var(--muted)' }));
                const actions = OS.el('div', { class: 'row' });
                actions.append(OS.el('button', { text: 'Edit', style: 'font-size:10px;padding:3px 0', onclick: OS.guard(() => editEvent(event)) }), OS.el('span', { class: 'spacer' }), ib('trash', 'Delete event', async () => { if (await OS.confirm('Delete event?', event.title, 'Delete', true)) {
                    events = events.filter(e => e.id !== event.id);
                    await save();
                } }));
                card.append(actions);
                agenda.append(card);
            } agenda.append(OS.el('p', { class: 'muted', text: 'Stored locally in this browser.', style: 'font-size:10px;margin-top:25px' })); };
            w.navigate = date => { if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                selected = date;
                month = new Date(date + 'T12:00');
                render();
            } };
            w.addEvent = async (event) => { events.push({ id: OS.uid(), ...event }); await save(); };
            render();
        }
    });
    OS.stopwatch = { running: false, start: 0, elapsed: 0, laps: [] };
    OS.timer = { endAt: null, remaining: 5 * 60 * 1000, notified: false };
    OS.register('clock', { title: 'Clock', description: 'World clocks, focused timers, and a stopwatch.', category: 'Utilities', width: 800, height: 580, minWidth: 360, singleton: true,
        mount: async (w) => {
            let tab = w.state.clockTab || 'world';
            let cities = await OS.db.get('worldCities') || [{ name: 'Local time', zone: Intl.DateTimeFormat().resolvedOptions().timeZone }, { name: 'London', zone: 'Europe/London' }, { name: 'New York', zone: 'America/New_York' }, { name: 'Tokyo', zone: 'Asia/Tokyo' }];
            const page = OS.el('div', { class: 'clock-app' }), tabs = OS.el('div', { class: 'clock-tabs' }), content = OS.el('div');
            page.append(tabs, content);
            w.body.append(page);
            let update = () => { };
            const format = (ms, centi = false) => { const total = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60; return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + (centi ? '.' + String(Math.floor(ms % 1000 / 10)).padStart(2, '0') : ''); };
            const elapsed = () => OS.stopwatch.elapsed + (OS.stopwatch.running ? performance.now() - OS.stopwatch.start : 0);
            const render = () => {
                w.state.clockTab = tab;
                OS.saveSession();
                tabs.replaceChildren();
                for (const [id, icon, name] of [['world', 'globe', 'World clock'], ['timer', 'clock', 'Timer'], ['stopwatch', 'clock', 'Stopwatch']])
                    tabs.append(OS.el('button', { class: tab === id ? 'active' : '', html: OS.icon(icon, 17) + name, onclick: () => { tab = id; render(); } }));
                content.replaceChildren();
                update = () => { };
                if (tab === 'world') {
                    const grid = OS.el('div', { class: 'world-grid' });
                    const elements = [];
                    for (const city of cities) {
                        const card = OS.el('div', { class: 'world-card' }), time = OS.el('div', { class: 'world-time' }), date = OS.el('small');
                        const heading = OS.el('div', { class: 'row' }, OS.el('strong', { text: city.name, style: 'font-size:12px;flex:1' }));
                        heading.append(ib('close', 'Remove ' + city.name, async () => { cities = cities.filter(c => c !== city); await OS.db.set('worldCities', cities); render(); }));
                        card.append(heading, time, date);
                        grid.append(card);
                        elements.push({ city, time, date });
                    }
                    content.append(grid, OS.el('button', { class: 'secondary', html: OS.icon('plus', 16) + 'Add city', style: 'margin-top:20px', onclick: OS.guard(async () => {
                            const options = [['Warsaw', 'Europe/Warsaw'], ['Paris', 'Europe/Paris'], ['Berlin', 'Europe/Berlin'], ['London', 'Europe/London'], ['New York', 'America/New_York'], ['Los Angeles', 'America/Los_Angeles'], ['Tokyo', 'Asia/Tokyo'], ['Singapore', 'Asia/Singapore'], ['Dubai', 'Asia/Dubai'], ['Sydney', 'Australia/Sydney'], ['UTC', 'UTC']];
                            const select = OS.el('select', { 'aria-label': 'City', style: 'width:100%' });
                            for (const [name, zone] of options)
                                select.append(OS.el('option', { value: zone, text: name }));
                            if (await OS.dialog({ title: 'Add a world clock', extra: select, confirm: 'Add' })) {
                                const pair = options.find(p => p[1] === select.value);
                                cities.push({ name: pair[0], zone: pair[1] });
                                await OS.db.set('worldCities', cities);
                                render();
                            }
                        }) }));
                    update = () => { const now = new Date(); for (const { city, time, date } of elements) {
                        time.textContent = new Intl.DateTimeFormat(undefined, { timeZone: city.zone, hour: '2-digit', minute: '2-digit', hour12: !OS.settings.clock24 }).format(now);
                        date.textContent = new Intl.DateTimeFormat(undefined, { timeZone: city.zone, weekday: 'short', month: 'short', day: 'numeric' }).format(now);
                    } };
                }
                else if (tab === 'stopwatch') {
                    const display = OS.el('div', { class: 'big-timer' }), controls = OS.el('div', { class: 'timer-controls' }), laps = OS.el('div', { class: 'lap-list' }), toggle = OS.el('button', { class: 'primary', text: OS.stopwatch.running ? 'Pause' : 'Start', style: 'min-width:110px', onclick: () => { const s = OS.stopwatch; if (s.running) {
                            s.elapsed = elapsed();
                            s.running = false;
                        }
                        else {
                            s.start = performance.now();
                            s.running = true;
                        } render(); } });
                    controls.append(toggle, OS.el('button', { class: 'secondary', text: 'Lap', onclick: () => { OS.stopwatch.laps.unshift(elapsed()); renderLaps(); } }), OS.el('button', { class: 'secondary', text: 'Reset', onclick: () => { OS.stopwatch = { running: false, start: 0, elapsed: 0, laps: [] }; render(); } }));
                    content.append(display, controls, laps);
                    const renderLaps = () => { laps.replaceChildren(); OS.stopwatch.laps.forEach((lap, i) => laps.append(OS.el('div', { class: 'lap-row' }, OS.el('span', { text: 'Lap ' + (OS.stopwatch.laps.length - i) }), OS.el('span', { text: format(lap, true) })))); };
                    renderLaps();
                    update = () => display.textContent = format(elapsed(), true);
                }
                else {
                    const display = OS.el('div', { class: 'big-timer' }), inputs = OS.el('div', { class: 'timer-inputs' }), min = OS.el('input', { type: 'number', min: 0, max: 1440, value: Math.floor(OS.timer.remaining / 60000), 'aria-label': 'Timer minutes' }), sec = OS.el('input', { type: 'number', min: 0, max: 59, value: Math.floor(OS.timer.remaining % 60000 / 1000), 'aria-label': 'Timer seconds' });
                    inputs.append(OS.el('label', {}, min, OS.el('span', { text: 'minutes' })), OS.el('label', {}, sec, OS.el('span', { text: 'seconds' })));
                    min.disabled = sec.disabled = !!OS.timer.endAt;
                    const controls = OS.el('div', { class: 'timer-controls' });
                    const toggle = OS.el('button', { class: 'primary', text: OS.timer.endAt ? 'Pause' : 'Start timer', style: 'min-width:120px', onclick: OS.guard(async () => { if (OS.timer.endAt) {
                            OS.timer.remaining = Math.max(0, OS.timer.endAt - Date.now());
                            OS.timer.endAt = null;
                        }
                        else {
                            const remaining = Number(min.value) * 60000 + Number(sec.value) * 1000;
                            if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 24 * 60 * 60 * 1000)
                                throw Error('Choose a duration from 1 second to 24 hours.');
                            OS.timer.remaining = remaining;
                            OS.timer.endAt = Date.now() + remaining;
                            OS.timer.notified = false;
                            OS.unlockAudio?.();
                        } render(); }) });
                    controls.append(toggle, OS.el('button', { class: 'secondary', text: 'Reset', onclick: () => { OS.timer = { endAt: null, remaining: 5 * 60000, notified: false }; render(); } }));
                    content.append(inputs, display, controls, OS.el('p', { class: 'muted', text: 'Timers continue when this window is closed, while the Aster tab stays open. Background-tab throttling can delay alerts.', style: 'font-size:11px;text-align:center;max-width:430px;margin:25px auto' }));
                    update = () => { const remaining = OS.timer.endAt ? Math.max(0, OS.timer.endAt - Date.now()) : OS.timer.remaining; display.textContent = format(remaining); if (OS.timer.notified) {
                        toggle.textContent = 'Start timer';
                        min.disabled = sec.disabled = false;
                    } };
                }
                update();
            };
            const tick = setInterval(() => update(), tab === 'world' ? 250 : 80);
            w.addCleanup(() => clearInterval(tick));
            render();
        }
    });
    OS.register('tasks', { title: 'Tasks', description: 'Make a little progress, one thing at a time.', category: 'Productivity', width: 815, height: 620, minWidth: 390, singleton: true,
        mount: async (w) => {
            let tasks = await OS.db.get('tasks') || [], filter = 'all';
            const layout = OS.el('div', { class: 'tasks-app' }), side = OS.el('aside', { class: 'tasks-sidebar' }), main = OS.el('div', { class: 'tasks-main' });
            layout.append(side, main);
            w.body.append(layout);
            let input;
            const save = async () => { await OS.db.set('tasks', tasks); OS.emit('tasks-change'); render(); };
            const remove = async (task) => { tasks = tasks.filter(t => t.id !== task.id); await save(); OS.notify('Task removed', task.title, 'info', { label: 'Undo', fn: async () => { tasks.push(task); await save(); } }); };
            const edit = async (task) => {
                const extra = OS.el('div', { class: 'column', style: 'margin-top:15px' }), due = OS.el('input', { type: 'date', value: task.due || '', 'aria-label': 'Due date' }), notes = OS.el('textarea', { rows: 3, placeholder: 'Notes', text: task.notes || '', 'aria-label': 'Task notes' }), important = OS.el('input', { type: 'checkbox', checked: task.priority === 'high', 'aria-label': 'Mark as important' });
                extra.append(OS.el('label', { text: 'Due date', style: 'font-size:12px' }), due, notes, OS.el('label', { class: 'row' }, important, 'Important'));
                const title = await OS.dialog({ title: 'Edit task', value: task.title, extra, confirm: 'Save' });
                if (title === null)
                    return;
                if (!title.trim())
                    throw Error('Task title cannot be empty.');
                Object.assign(task, { title: title.trim().slice(0, 200), due: due.value, notes: notes.value, priority: important.checked ? 'high' : 'normal' });
                await save();
            };
            const views = [['all', 'checklist', 'My tasks'], ['today', 'sun', 'My day'], ['important', 'star', 'Important'], ['planned', 'calendar', 'Planned'], ['done', 'check', 'Completed']];
            const render = () => {
                side.replaceChildren(OS.el('h3', { text: 'Your lists', style: 'font-size:13px;padding:0 12px 13px' }));
                for (const [id, icon, title] of views)
                    side.append(OS.el('button', { class: 'nav-item' + (filter === id ? ' active' : ''), html: OS.icon(icon, 17) + title, onclick: () => { filter = id; render(); } }));
                main.replaceChildren();
                const title = views.find(v => v[0] === filter)[2];
                main.append(OS.el('h1', { text: title }), OS.el('p', { class: 'muted', text: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }), style: 'font-size:12px' }));
                const form = OS.el('form', { class: 'task-input-form' });
                input = OS.el('input', { placeholder: 'Add a task', 'aria-label': 'New task' });
                const add = OS.el('button', { type: 'submit', class: 'primary', html: OS.icon('plus', 17), title: 'Add task', 'aria-label': 'Add task' });
                form.append(input, add);
                form.onsubmit = OS.guard(async (e) => { e.preventDefault(); if (!input.value.trim())
                    return; tasks.push({ id: OS.uid(), title: input.value.trim().slice(0, 200), done: false, priority: filter === 'important' ? 'high' : 'normal', due: filter === 'today' ? OS.isoDate(new Date()) : '', addedDay: OS.isoDate(new Date()), notes: '' }); await save(); input.focus(); });
                main.append(form);
                const today = OS.isoDate(new Date()), list = tasks.filter(t => filter === 'done' ? t.done : filter === 'today' ? !t.done && (t.due === today || t.addedDay === today) : filter === 'important' ? !t.done && t.priority === 'high' : filter === 'planned' ? !t.done && t.due : !t.done);
                list.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1) || (a.due || 'z').localeCompare(b.due || 'z'));
                for (const task of list) {
                    const row = OS.el('div', { class: 'todo-row' + (task.done ? ' done' : '') }), check = OS.el('input', { type: 'checkbox', checked: task.done, 'aria-label': 'Complete ' + task.title });
                    check.onchange = OS.guard(async () => { task.done = check.checked; await save(); });
                    const name = OS.el('div', { class: 'todo-name', text: task.title });
                    name.ondblclick = OS.guard(() => edit(task));
                    if (task.due || task.notes)
                        name.append(OS.el('small', { text: (task.due ? 'Due ' + task.due : '') + (task.due && task.notes ? ' · ' : '') + (task.notes ? 'Has notes' : '') }));
                    const star = ib('star', 'Toggle importance', async () => { task.priority = task.priority === 'high' ? 'normal' : 'high'; await save(); });
                    if (task.priority === 'high')
                        star.classList.add('priority');
                    row.append(check, name, star, ib('rename', 'Edit task', () => edit(task)), ib('trash', 'Delete task', () => remove(task)));
                    main.append(row);
                }
                if (!list.length)
                    main.append(OS.el('div', { class: 'empty', style: 'min-height:180px', html: OS.icon(filter === 'done' ? 'check' : 'sun', 45) + `<strong>${filter === 'done' ? 'Your wins will live here' : 'A little space to breathe.'}</strong><span>${filter === 'done' ? 'Complete a task to see it here.' : 'Add a task when you’re ready.'}</span>` }));
                main.append(OS.el('p', { class: 'muted', text: `${tasks.filter(t => t.done).length} completed · ${tasks.filter(t => !t.done).length} to go · Stored locally`, style: 'font-size:10px;margin-top:24px' }));
                if (filter === 'done' && list.length)
                    main.append(OS.el('button', { class: 'secondary', text: 'Clear completed', onclick: OS.guard(async () => { if (await OS.confirm('Clear completed tasks?', 'This removes all completed tasks.', 'Clear', true)) {
                            tasks = tasks.filter(t => !t.done);
                            await save();
                        } }) }));
            };
            w.addTask = async (title) => { tasks.push({ id: OS.uid(), title, done: false, priority: 'normal', due: '', notes: '' }); await save(); };
            w.on('tasks-change',async()=>{tasks=await OS.db.get('tasks')||[];if(!w.closed)render();});
            render();
        }
    });
    OS.register('mines', { title: 'Mines', description: 'A familiar puzzle. A fresh little challenge.', category: 'Games', width: 525, height: 600, minWidth: 350, minHeight: 470,
        mount: async (w) => {
            let difficulty = 'easy', cols = 9, rows = 9, mines = 10, cells = [], started = false, over = false, won = false, startTime = 0, seconds = 0, flagMode = false, selected = 0, best = await OS.db.get('minesBest') || {};
            const page = OS.el('div', { class: 'mines-app' }), toolbar = OS.el('div', { class: 'row', style: 'width:100%;justify-content:center;flex-wrap:wrap' }), level = OS.el('select', { 'aria-label': 'Difficulty' }), flagB = OS.el('button', { class: 'secondary', html: OS.icon('flag', 15) + 'Flag mode', 'aria-pressed': 'false', onclick: () => { flagMode = !flagMode; flagB.classList.toggle('primary', flagMode); flagB.setAttribute('aria-pressed', String(flagMode)); } }), score = OS.el('div', { class: 'mines-score' }), counter = OS.el('span', { class: 'mines-number' }), reset = OS.el('button', { html: OS.icon('spark', 26), title: 'New game', 'aria-label': 'New game', onclick: () => newGame() }), time = OS.el('span', { class: 'mines-number' }), grid = OS.el('div', { class: 'mine-grid', role: 'grid', 'aria-label': 'Mine field' }), status = OS.el('div', { class: 'mine-status' }), hint = OS.el('small', { text: 'Click to reveal · Right-click to flag · First click is safe', style: 'font-size:10px;margin-top:9px;text-align:center' });
            for (const [v, t] of [['easy', 'Easy · 9 × 9'], ['medium', 'Medium · 16 × 16'], ['hard', 'Hard · 30 × 16']])
                level.append(OS.el('option', { value: v, text: t }));
            level.onchange = () => { difficulty = level.value; newGame(); };
            toolbar.append(level, flagB);
            score.append(counter, reset, time);
            page.append(toolbar, score, grid, status, hint);
            w.body.append(page);
            const adjacent = i => { const x = i % cols, y = Math.floor(i / cols), list = []; for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy)
                        continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx >= 0 && ny >= 0 && nx < cols && ny < rows)
                        list.push(ny * cols + nx);
                } return list; };
            const seed = first => { const excluded = new Set([first, ...adjacent(first)]), possible = cells.map((_, i) => i).filter(i => !excluded.has(i)); for (let i = possible.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [possible[i], possible[j]] = [possible[j], possible[i]];
            } for (const i of possible.slice(0, mines))
                cells[i].mine = true; for (let i = 0; i < cells.length; i++)
                cells[i].n = adjacent(i).filter(j => cells[j].mine).length; started = true; startTime = performance.now(); };
            const updateScore = () => { counter.textContent = String(mines - cells.filter(c => c.flag).length).padStart(3, '0'); time.textContent = String(seconds).padStart(3, '0'); status.textContent = over ? (won ? 'Beautifully done. You found every safe cell.' : 'A little too close. Start a fresh board.') : best[difficulty] ? 'Best time: ' + best[difficulty] + ' seconds' : 'Clear the board without revealing a mine.'; reset.innerHTML = OS.icon(over ? (won ? 'check' : 'refresh') : 'spark', 26); };
            const renderCells = () => { const colors = ['', '#276bc2', '#328447', '#c03d4d', '#7054ba', '#a77838', '#169798', '#50566c', '#7b818d']; for (let i = 0; i < cells.length; i++) {
                const c = cells[i], el = grid.children[i];
                el.className = 'mine-cell' + (c.revealed ? ' revealed' : '') + (c.flag ? ' flagged' : '') + (over && c.mine ? ' bomb' : '');
                el.innerHTML = (c.revealed || over) && c.mine ? OS.icon('bug', 17) : c.flag ? OS.icon('flag', 15) : c.revealed && c.n ? String(c.n) : '';
                el.style.color = c.revealed && !c.mine ? colors[c.n] : '';
                el.setAttribute('aria-label', `Row ${Math.floor(i / cols) + 1}, column ${i % cols + 1}: ${c.flag ? 'flagged' : c.revealed ? (c.mine ? 'mine' : c.n + ' adjacent mines') : 'hidden'}`);
                el.tabIndex = i === selected ? 0 : -1;
            } updateScore(); };
            const reveal = i => {
                if (over || cells[i].flag || cells[i].revealed)
                    return;
                if (!started)
                    seed(i);
                if (cells[i].mine) {
                    cells[i].revealed = true;
                    over = true;
                    won = false;
                    renderCells();
                    return;
                }
                const queue = [i];
                while (queue.length) {
                    const n = queue.pop(), c = cells[n];
                    if (c.revealed || c.flag || c.mine)
                        continue;
                    c.revealed = true;
                    if (!c.n)
                        for (const next of adjacent(n))
                            if (!cells[next].revealed)
                                queue.push(next);
                }
                if (cells.filter(c => c.revealed).length === cells.length - mines) {
                    over = true;
                    won = true;
                    seconds = Math.floor((performance.now() - startTime) / 1000);
                    for (const c of cells)
                        if (c.mine)
                            c.flag = true;
                    if (best[difficulty] === undefined || seconds < best[difficulty]) {
                        best[difficulty] = seconds;
                        OS.db.set('minesBest', best);
                    }
                    OS.notify('A clean sweep!', `${difficulty[0].toUpperCase() + difficulty.slice(1)} board completed in ${seconds} seconds.`);
                }
                renderCells();
            };
            const flag = i => { if (over || cells[i].revealed)
                return; cells[i].flag = !cells[i].flag; renderCells(); };
            function newGame() { [cols, rows, mines] = ({ easy: [9, 9, 10], medium: [16, 16, 40], hard: [30, 16, 99] })[difficulty]; cells = Array.from({ length: cols * rows }, () => ({ mine: false, n: 0, revealed: false, flag: false })); started = over = won = false; seconds = 0; selected = 0; grid.style.gridTemplateColumns = `repeat(${cols},29px)`; grid.replaceChildren(); for (let i = 0; i < cells.length; i++) {
                const b = OS.el('button', { class: 'mine-cell', role: 'gridcell', type: 'button' });
                b.onclick = e => { selected = i; (flagMode || e.shiftKey) ? flag(i) : reveal(i); };
                b.oncontextmenu = e => { e.preventDefault(); selected = i; flag(i); };
                b.ondblclick = () => { const c = cells[i]; if (c.revealed && c.n === adjacent(i).filter(j => cells[j].flag).length)
                    for (const n of adjacent(i))
                        if (!cells[n].flag)
                            reveal(n); };
                b.onkeydown = e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                    e.preventDefault();
                    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
                    selected = Math.max(0, Math.min(cells.length - 1, selected + delta));
                    renderCells();
                    grid.children[selected].focus();
                }
                else if (e.code === 'Space') {
                    e.preventDefault();
                    flag(i);
                }
                else if (e.key === 'Enter') {
                    e.preventDefault();
                    reveal(i);
                } };
                grid.append(b);
            } if (difficulty !== 'easy') {
                w.rect.w = Math.min(innerWidth - 20, difficulty === 'hard' ? 1010 : 620);
                w.rect.h = Math.min(innerHeight - 75, 760);
                w.constrain();
                w.sync();
            } renderCells(); }
            const tick = setInterval(() => { if (started && !over) {
                seconds = Math.floor((performance.now() - startTime) / 1000);
                updateScore();
            } }, 250);
            w.addCleanup(() => clearInterval(tick));
            w.game = { get cells() { return cells; }, reveal, flag, newGame, get over() { return over; }, get won() { return won; }, get mines() { return mines; } };
            newGame();
        }
    });
})();
