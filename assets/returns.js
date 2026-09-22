/* The returns guide keeps case data only for this page session. */
(function(){
'use strict';
const C=window.ReturnsCore;
const cases={
 cancel:{title:'Отмена до отправки',sub:'В том числе предзаказ',steps:['Проверьте оплату и статус отправки. Сразу запросите остановку отправки.','Зафиксируйте дату требования и сумму фактической оплаты. Срок APRELL — 3 календарных дня.','Напишите в чат «Обмены/возвраты», поставьте задачу в amoCRM за день до срока.','После подтверждения отмены и возврата сообщите клиенту. Для неоплаченного заказа выплаты нет.']},
 pvz:{title:'Отказ в ПВЗ',sub:'Сумку ещё не забрали',steps:['Проверьте, что заказ ещё не вручили. Отказ бесплатный, бланк не нужен.','Проверьте фактическую оплату, включая доставку. Укажите возвращаемую сумму.','Зафиксируйте дату требования. В чат отправьте отказ, трек, сумму и крайнюю дату.','Отслеживайте возврат оплаты. Получите подтверждение операции и сообщите клиенту.']},
 quality:{title:'После получения',sub:'Качественная сумка: возврат или обмен',steps:['Проверьте дату получения и способ покупки. Для онлайн-покупки обычно 7 дней на отказ.','При возврате отправьте единый скрипт: бланк, адрес, упаковка и срок. Обратную доставку оплачивает клиент.','Сразу зарегистрируйте требование в чате. Добавьте трек после отправки. Товар проверяет Сергей.','Для обмена уточните желаемую модель и согласуйте наличие, доставку, доплату и срок.','Поставьте задачу в amoCRM. Закройте обращение после подтверждения выплаты или выполненного обмена.']},
 retail:{title:'Розничная точка',sub:'Покупка непосредственно в магазине',steps:['Проверьте точку и дату покупки в сделке. Уточните только отсутствующие данные. Самовывоз онлайн-заказа сам по себе не означает розничную покупку.','Качественный товар: 14 дней на обращение за обменом, без дня покупки. Нужны сохранность и отсутствие использования.','Точка подтверждает наличие аналога. Если подходящего аналога нет — возможен возврат денег, 3 дня от возврата товара в точку.','В чат передайте подтверждение точки, дату приёма товара и срок. При недостатке выберите ситуацию «Заявленный брак».']},
 defect:{title:'Заявленный брак',sub:'Сначала видео, затем дальнейшие действия',steps:['Сразу зафиксируйте обращение. Номер заказа берём из сделки, у клиента повторно не запрашиваем.','Запросите только видео: общий план, недостаток крупно, работа фурнитуры. Отсутствие видео не отменяет обращение.','Передайте видео Сергею. Менеджер не подтверждает брак и не выбирает за клиента способ решения.','Если клиент уже заявил требование, укажите его и исходную дату. Ожидание видео или посылки не запускает срок заново.','По решению Сергея организуйте передачу сумки для проверки. В ответе клиенту имя проверяющего не называем.','Контролируйте срок. Если сумка не передана или срок заканчивается, срочно напишите Сергею. После проверки получите решение и подтверждение исполнения.']},
 wrong:{title:'Ошибка комплектации',sub:'Другой товар или чего-то не хватает',steps:['Сверьте заказ и сообщение клиента. Запросите видео полученного товара.','Сразу передайте обращение Сергею, зафиксируйте уже заявленное требование и дату.','Согласуйте исправление ошибки и доставку за счёт магазина. Не обещайте замену без проверки наличия.','Следите за сроком и сообщите клиенту результат. Закройте обращение после исполнения.']}
};
let saved={demand:C.today(),case:'cancel',request:'refund',paid:'yes',payment:'card',split:'full',written:'yes',noAnalog:'no',check:'7',stage:'initial'};
function mount(root){
 const host=root.querySelector('#returns-workspace');if(!host)return;
 host.className='returns-workspace';
 host.innerHTML=`<div class="rt-choices" aria-label="Ситуация клиента">${Object.entries(cases).map(([id,c])=>`<button type="button" data-case="${id}" aria-pressed="false"><strong>${c.title}</strong><span>${c.sub}</span></button>`).join('')}</div>
 <section class="rt-guide"><h3 id="rt-case-title"></h3><ol id="rt-steps"></ol></section>
 <h3>Срок и данные обращения</h3><p class="rt-help">Дата обращения по умолчанию — сегодня по Москве. Если клиент обратился раньше, измените дату. Дата и сумма подставятся в оба сообщения. Введённые данные не отправляются на сервер.</p>
 <label class="rt-stage">Этап обращения<select id="rt-stage"></select></label>
 <form id="rt-form" autocomplete="off"><div class="rt-grid">
 <label data-field="request">Требование<select name="request"></select></label>
 <label data-field="demand">Дата обращения / требования<input name="demand" type="date"></label>
 <label data-field="received">Получен клиентом<input name="received" type="date"></label>
 <label data-field="shopReceived">Фактически получен магазином<input name="shopReceived" type="date"></label>
 <label data-field="written">Правила переданы письменно при доставке<select name="written"><option value="yes">Да</option><option value="no">Нет — подтверждено</option><option value="unknown">Неизвестно — проверить</option></select></label>
 <label data-field="noAnalog">Подходящего аналога в точке нет<select name="noAnalog"><option value="no">Ещё не подтверждено</option><option value="yes">Точка подтвердила отсутствие</option></select></label>
 <label data-field="check">Условия замены<select name="check"><option value="7">Обычная замена — 7 дней</option><option value="20">Нужна дополнительная проверка — 20 дней</option><option value="month">Нет товара на дату требования — месяц</option></select></label>
 <label data-field="agreed">Согласованная дата исполнения<input name="agreed" type="date"></label>
 <label data-field="paid">Оплата<select name="paid"><option value="yes">Оплачен полностью или доставка</option><option value="no">Оплаты не было</option></select></label>
 <label data-field="amount">Сумма возврата, ₽<input name="amount" type="number" min="0" step="0.01" placeholder="Фактически возвращаемая сумма"></label>
 <label data-field="payment">Способ оплаты<select name="payment"><option value="card">Карта через ЮKassa</option><option value="split">Обычный Сплит</option><option value="super">Супер Сплит</option><option value="other">Другой</option></select></label>
 <label data-field="split">Объём возврата<select name="split"><option value="full">Полный</option><option value="partial">Частичный</option></select></label></div>
 <details class="rt-details"><summary>Данные для сообщений (необязательно)</summary><div class="rt-grid">
 ${[['name','Имя клиента'],['deal','Ссылка на сделку'],['model','Модель и цвет / возвращаемые позиции'],['store','Розничная точка'],['replacement','Модель и цвет для обмена'],['track','Трек-номер'],['terms','Согласованные условия / запрос передачи'],['proof','Подтверждение операции / акт']].map(([name,label])=>`<label data-extra="${name}">${label}<input name="${name}" type="text" maxlength="1000"></label>`).join('')}
 <label data-extra="reason">Причина / недостаток со слов клиента<textarea name="reason" rows="2" maxlength="2000"></textarea></label>
 <label data-extra="result">Результат проверки / чего ожидаем<textarea name="result" rows="2" maxlength="2000"></textarea></label>
 <label data-extra="paidAt">Дата выполненной операции<input name="paidAt" type="date"></label></div></details></form>
 <div class="rt-deadline" aria-live="polite" id="rt-deadline"></div>
 <p class="rt-help">Считаем календарные дни со следующего дня после события. Для контроля APRELL не переносим дату на более поздний день из-за выходных и праздников. Применимость переноса по ст. 193 ГК РФ проверяет ответственный; автоматически клиенту продление не обещаем.</p>
 <h3>Готовые сообщения</h3><p id="rt-video-note" class="rt-help" hidden>Видео перешлите или прикрепите в чат с Сергеем отдельным сообщением. Ссылка не нужна.</p>
 <p class="rt-help" id="rt-copy-hint">Перед отправкой замените оставшиеся поля в квадратных скобках. Кнопка только копирует текст.</p>
 <div class="rt-scripts"><section><div class="rt-script-head"><h4>Клиенту</h4><button type="button" data-copy="client">Копировать клиенту</button></div><pre id="rt-client"></pre></section><section><div class="rt-script-head"><h4>В чат «Обмены/возвраты»</h4><button type="button" data-copy="chat">Копировать в чат</button></div><pre id="rt-chat"></pre></section></div>
 <p class="rt-copy-status" role="status"></p><button class="rt-reset" type="button">Очистить данные обращения</button>`;
 const form=host.querySelector('form');
 for(const control of form.elements)if(control.name&&saved[control.name]!==undefined)control.value=saved[control.name];
 for(const control of form.querySelectorAll('input[type="date"]'))if(control.name!=='agreed')control.max=C.today();
 const stage=host.querySelector('#rt-stage');
 function read(){for(const x of form.elements)if(x.name)saved[x.name]=x.value;saved.stage=stage.value;}
 function show(name,visible){form.querySelector(`[data-field="${name}"]`).hidden=!visible;}
 function setOptions(select,options,value){select.replaceChildren(...options.map(([val,label])=>{const o=document.createElement('option');o.value=val;o.textContent=label;return o;}));select.value=options.some(o=>o[0]===value)?value:options[0][0];}
 function setup(){
  const type=saved.case;const c=cases[type];
  host.querySelector('#rt-case-title').textContent=c.title;
  const list=host.querySelector('#rt-steps');list.replaceChildren(...c.steps.map(s=>{const li=document.createElement('li');li.textContent=s;return li;}));
  host.querySelectorAll('[data-case]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.case===type)));
  const requests=type==='defect'||type==='wrong'?[['initial','Первичное обращение — требования пока нет'],['refund','Клиент требует деньги'],['replace','Клиент требует замену'],['repair','Клиент требует ремонт']]:type==='quality'||type==='retail'?[['refund','Возврат денег'],['replace','Обмен']]:[['refund','Отмена / возврат оплаты']];
  setOptions(form.elements.request,requests,saved.request);saved.request=form.elements.request.value;
  let stages=[['initial','Первое сообщение']];
  if(type==='defect'||type==='wrong')stages.push(['send','Передача на проверку'],['waiting','Клиент не передал сумку']);
  if(!['cancel','pvz'].includes(type))stages.push(['received','Сумка получена'],['approved','Возврат / обмен согласован'],['dispute','Результат проверки / спор']);
  stages.push(['urgent','Срочно: срок заканчивается'],['done','Исполнено — есть подтверждение']);
  setOptions(stage,stages,saved.stage);saved.stage=stage.value;update();
 }
 function update(){
  read();const v=saved,c=C.calculate(v);const flaw=['defect','wrong'].includes(v.case);
  show('request',!['cancel','pvz'].includes(v.case));
  show('received',!['cancel','pvz'].includes(v.case));
  show('shopReceived',(v.case==='retail'&&v.request==='refund')||(!['cancel','pvz'].includes(v.case)&&['received','approved','dispute','urgent','done'].includes(v.stage)));
  const extra={name:true,deal:true,model:true,store:v.case==='retail',replacement:v.request==='replace',track:!['cancel'].includes(v.case)&&v.stage!=='initial',terms:v.request==='replace'||['send','waiting'].includes(v.stage),proof:['approved','dispute','done'].includes(v.stage),reason:!['cancel','pvz'].includes(v.case),result:['approved','dispute','urgent','waiting'].includes(v.stage),paidAt:v.stage==='done'};
  host.querySelectorAll('[data-extra]').forEach(label=>label.hidden=!extra[label.dataset.extra]);
  host.querySelector('#rt-video-note').hidden=!flaw;
  show('written',v.case==='quality');show('noAnalog',v.case==='retail'&&v.request==='refund');
  show('check',flaw&&v.request==='replace');show('agreed',v.request==='repair'||['quality','retail'].includes(v.case)&&v.request==='replace');
  const money=v.paid!=='no'&&v.request==='refund';
  show('paid',['cancel','pvz'].includes(v.case));show('amount',money);show('payment',money);show('split',money&&['split','super'].includes(v.payment));
  const box=host.querySelector('#rt-deadline');box.replaceChildren();
  function line(tag,text){const node=document.createElement(tag);node.textContent=text;box.append(node);}
  line('span',c.label);line('strong',c.due?C.fmt(c.due):c.label==='Возврат денег не нужен'?'Без выплаты':'Укажите данные для расчёта');line('p',c.basis);
  box.classList.toggle('rt-overdue',c.remaining!==null&&c.remaining<0);
  if(c.due){line('p',c.remaining<0?`Срок контроля прошёл ${-c.remaining} дн. назад — срочно Сергею.`:c.remaining===0?'Последний день — сегодня.':`До срока: ${c.remaining} дн.`);line('p',`Задача в amoCRM: ${C.fmt(c.reminder)}${c.reminderOverdue?' — дата прошла, поставьте на сегодня.':''}`);}
  if(c.eligibility)line('p',`Обратиться по качественному товару можно до ${C.fmt(c.eligibility)}. Это отдельный срок, не дата выплаты.`);
  if(v.case==='quality'&&v.written==='unknown')line('p','Передачу письменных правил нужно проверить: при их отсутствии срок отказа может составить 3 месяца.');
  if(flaw&&v.request==='refund'&&!v.shopReceived)line('p','Сумка ещё не получена. Организуйте передачу для проверки. Если срок заканчивается — срочно Сергею; отсчёт не обнуляется.');
  if(c.warning)line('p',c.warning);
  const texts=C.messages(v,c);host.querySelector('#rt-client').textContent=texts.client;host.querySelector('#rt-chat').textContent=texts.chat;
  const invalid=!!c.warning&&!c.due;
  host.querySelector('.rt-copy-status').textContent='';
  host.querySelector('[data-copy="client"]').disabled=invalid;
  host.querySelector('#rt-copy-hint').textContent=invalid?'Сначала исправьте даты или уточните условия. Запрос Сергею можно скопировать.':'Перед отправкой замените оставшиеся поля в квадратных скобках. Кнопка только копирует текст.';
 }
 host.querySelectorAll('[data-case]').forEach(button=>button.addEventListener('click',()=>{read();saved.case=button.dataset.case;saved.request=['defect','wrong'].includes(saved.case)?'initial':saved.case==='retail'?'replace':'refund';saved.paid='yes';form.elements.paid.value='yes';saved.stage='initial';saved.agreed='';form.elements.agreed.value='';setup();}));
 form.addEventListener('input',update);form.addEventListener('change',update);form.addEventListener('submit',e=>e.preventDefault());stage.addEventListener('change',update);
 host.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{
  const text=host.querySelector('#rt-'+button.dataset.copy).textContent;
  try{await writeClipboard(text);host.querySelector('.rt-copy-status').textContent='Скопировано. Проверьте текст перед отправкой.';}catch{host.querySelector('.rt-copy-status').textContent='Не удалось скопировать. Выделите текст вручную.';}
 }));
 host.querySelector('.rt-reset').addEventListener('click',()=>{saved={demand:C.today(),case:saved.case,request:saved.request,paid:'yes',payment:'card',split:'full',written:'yes',noAnalog:'no',check:'7',stage:'initial'};mount(root);});
 setup();
}
window.mountReturns=mount;
})();
