/* Shared date and message rules: browser + node tests. Calendar dates use UTC. */
(function(root){
'use strict';
const DAY=86400000;
function parse(s){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s||'')) return null;
 const d=new Date(s+'T00:00:00Z');
 return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?d:null;
}
function add(s,n){const d=parse(s);if(!d)return '';d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function months(s,n){const d=parse(s);if(!d)return '';const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);}
function fmt(s){return parse(s)?s.split('-').reverse().join('.'):'[дата]';}
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function days(a,b){return parse(a)&&parse(b)?Math.round((parse(a)-parse(b))/DAY):null;}
function calculate(v,now=today()){
 let due='',label='',basis='',warning='',eligibility='';
 if(v.case==='quality'||v.case==='retail'){
  eligibility=v.case==='retail'?add(v.received,14):v.written==='no'?months(v.received,3):add(v.received,7);
 }
 if(v.paid==='no'&&(v.case==='cancel'||v.case==='pvz'))return {due:'',label:'Возврат денег не нужен',basis:'Оплаты не было.',eligibility};
 if(v.case==='cancel'){due=add(v.demand,3);label='Возврат оплаты';basis='3 календарных дня от требования.';}
 if(v.case==='pvz'||v.case==='quality'&&v.request==='refund'){
  due=add(v.demand,10);label='Возврат денег';basis='10 календарных дней от требования — ст. 26.1.';
 }
 if(v.case==='quality'&&v.request==='replace'){due=v.agreed;label='Согласованный обмен';basis='Дата обмена по согласованию с клиентом и Сергеем.';}
 if(v.case==='retail'){
  if(v.request==='refund'){
   label='Возврат денег';basis='3 дня от возврата товара в точку, если подходящего аналога нет — ст. 25.';
   if(v.noAnalog==='yes')due=add(v.shopReceived,3);else warning='Сначала точка подтверждает отсутствие подходящего аналога. Автоматически обещать возврат денег нельзя.';
  }else{due=v.agreed;label='Обмен в точке';basis='Срок исполнения уточняет точка. 14 дней — срок обращения за обменом, не срок его выполнения.';}
 }
 if(v.case==='defect'||v.case==='wrong'){
  if(v.request==='initial'){label='Первичное обращение';basis='Запросите видео и передайте Сергею. Если требование уже заявлено — выберите его, не ждите видео.';}
  if(v.request==='refund'){due=add(v.demand,10);label='Возврат денег';basis='10 календарных дней от требования — ст. 22. Получение сумки не запускает срок заново.';}
  if(v.request==='replace'){
   due=v.check==='20'?add(v.demand,20):v.check==='month'?months(v.demand,1):add(v.demand,7);
   label='Замена товара';basis=v.check==='20'?'20 дней: дополнительная проверка необходима, подтверждено Сергеем.':v.check==='month'?'Один месяц: товара для замены нет на дату требования, подтверждено Сергеем.':'7 дней от требования — ст. 21.';
  }
  if(v.request==='repair'){
   due=v.agreed;label='Ремонт';basis='Срок по письменному соглашению, не более 45 дней. Без соглашения — незамедлительно, в минимально необходимый срок.';
   if(due&&days(due,v.demand)>45){warning='Согласованный срок превышает 45 дней. Передайте Сергею для исправления.';due='';}
  }
 }
 if(v.demand&&(!parse(v.demand)||v.demand>now)){warning='Укажите действительную дату обращения: она не может быть в будущем.';due='';}
 if(v.received&&(!parse(v.received)||v.received>now)){warning='Проверьте дату получения клиентом.';due='';eligibility='';}
 if(v.shopReceived&&(!parse(v.shopReceived)||v.shopReceived>now)){warning='Проверьте дату получения товара магазином.';due='';}
 if(v.received&&v.demand&&v.demand<v.received&&(v.case==='quality'||v.case==='retail'||v.case==='defect')){warning='Дата требования раньше получения товара. Проверьте даты или выберите отказ до получения.';due='';}
 if(v.agreed&&v.demand&&v.agreed<v.demand){warning='Согласованный срок не может быть раньше требования.';due='';}
 if(eligibility&&v.demand>eligibility)warning+=' Срок обращения по качественному товару требует проверки ответственным. Не отказывайте автоматически.';
 const remaining=due?days(due,now):null;
 const reminder=due?add(due,-1):'';
 return {due,label,basis,eligibility,warning:warning.trim(),remaining,reminder,reminderOverdue:reminder&&reminder<now};
}
const address='Получатель: Мирфазы Сергей Владимирович\nТелефон: +7 985 899-53-98\nПункт СДЭК: Санкт-Петербург, пр-т Юрия Гагарина, 2, корп. 3.';
const form='https://aprellshop.ru/assets/files/Заявление%20на%20возврат%20товара_08-2024.pdf';
const titles={cancel:'ОТМЕНА ДО ОТПРАВКИ / ПРЕДЗАКАЗ',pvz:'ОТКАЗ ДО ПОЛУЧЕНИЯ',quality:'КАЧЕСТВЕННЫЙ ТОВАР',retail:'РОЗНИЧНАЯ ТОЧКА',defect:'БРАК / ЗАЯВЛЕННЫЙ НЕДОСТАТОК',wrong:'ОШИБКА КОМПЛЕКТАЦИИ'};
function messages(v,c){
 const val=(k,f)=>v[k]?.trim()||f;
 const name=val('name','[Имя]'),sum=val('amount','[сумма]'),model=val('model','[модель, цвет]');
 const deadline=c.due?fmt(c.due):'[уточнить дату]';
 const money=`Вернём оплаченную сумму — ${sum} ₽ — не позднее ${deadline}. После проведения возврата сообщим вам.`;
 let client='';
 if(v.case==='cancel')client=v.paid==='no'?`${name}, приняли ваш запрос на отмену заказа. Подтвержу отмену после проверки статуса отправки.`:`${name}, приняли ваш запрос на отмену заказа. Возврат оплаты ${sum} ₽ проведём в течение 3 календарных дней с даты обращения, не позднее ${deadline}. После проведения возврата сообщим вам.`;
 if(v.case==='pvz')client=`${name}, сообщите сотруднику ПВЗ, что отказываетесь от получения. Такой отказ бесплатный, бланк возврата заполнять не нужно.`+(v.paid==='no'?'':'\n\n'+money);
 if(v.case==='quality')client=v.request==='replace'?`${name}, подскажите, пожалуйста, какую модель и цвет вы хотите получить взамен? Уточню наличие и порядок обмена.`:`${name}, вернуть сумку можно в течение ${v.written==='no'?'3 месяцев':'7 дней'} после получения при сохранении её товарного вида и потребительских свойств.\n\nБланк возврата: ${form}\nЗаполните его и вложите в посылку вместе с сумкой. Просим также вернуть ярлыки, пыльник и комплектную упаковку.\n\nДанные для отправки через СДЭК:\n${address}\n\nУпакуйте сумку в прочную коробку, чтобы она не сдавливалась и не перемещалась внутри. Защитите фурнитуру от соприкосновения с поверхностью сумки. Обратную доставку оплачивает покупатель.\n\nПосле отправки пришлите, пожалуйста, трек-номер. Крайняя дата возврата денег по вашему обращению — ${deadline}.`;
 if(v.case==='retail')client=`${name}, подскажите, пожалуйста, в каком магазине и когда вы купили сумку? Уточню порядок оформления у сотрудников точки и вернусь к вам с ответом.`;
 if(v.case==='defect')client=`${name}, мне жаль, что возникла такая ситуация. Пришлите, пожалуйста, видео: покажите сумку целиком, затем крупным планом место недостатка. Если проблема с молнией или другой фурнитурой, покажите её в действии. Передадим видео на проверку и сообщим дальнейшие действия.`;
 if(v.case==='wrong')client=`${name}, извините за ситуацию. Пришлите, пожалуйста, видео того, что получили. Передам информацию ответственному и сообщу, как исправим ошибку.`;
 const stage=v.stage||'initial';
 if(stage==='send')client=`${name}, для проверки необходимо отправить нам сумку.\n\n${address}\n\nУпакуйте сумку в прочную коробку, защитите её от сдавливания и фурнитуру от соприкосновения с поверхностью сумки. После отправки пришлите, пожалуйста, трек-номер. После получения и проверки сообщим результат и дальнейшие действия по вашему обращению.`;
 if(stage==='received')client=`${name}, вашу сумку получили и передали на проверку. Я слежу за обращением и сообщу вам результат.`;
 if(stage==='approved')client=v.request==='repair'?`${name}, ремонт согласован. Срок выполнения — ${deadline}. ${val('terms','[согласованные условия ремонта]')}`:v.request==='replace'?`${name}, обмен согласовали: ${model} на ${val('replacement','[новая модель, цвет]')}. Срок выполнения — ${deadline}. ${val('terms','[согласованные условия доставки и доплаты]')}`:`${name}, проверка завершена, возврат согласован. Сумма к возврату — ${sum} ₽. Возврат проведём не позднее ${deadline}. После проведения операции пришлю подтверждение.`;
 if(stage==='dispute')client=`${name}, получили результат проверки: ${val('result','[точное заключение и его основание]')}. Направляю вам ${val('proof','[акт/заключение]')}. Если вы не согласны с результатом, сообщите, пожалуйста: зафиксирую возражения и передам ответственному для дальнейшего рассмотрения.`;
 if(stage==='done')client=v.request==='repair'?`${name}, ремонт выполнен. ${val('proof','[подтверждение и порядок передачи сумки]')}`:(['cancel','pvz'].includes(v.case)&&v.paid==='no')?`${name}, ваш заказ отменён.`:v.request==='replace'?`${name}, обмен выполнен: ${val('replacement','[модель, цвет]')}. ${val('proof','[подтверждение получения]')}`:`${name}, ${fmt(v.paidAt)} мы провели возврат ${sum} ₽. ${val('proof','[подтверждение операции]')}. Срок зачисления зависит от банка. Если деньги не поступят, напишите нам — проверим статус возврата.`;
 if((['initial','approved','done'].includes(stage))&&v.paid!=='no'&&((['cancel','pvz','quality'].includes(v.case)&&v.request==='refund')||(stage==='approved'&&v.request==='refund'))){
  if(v.payment==='card')client+='\n\nДеньги вернутся на карту, которой вы оплатили заказ. Банковские реквизиты присылать не нужно.';
  if(v.payment==='split')client+=v.split==='partial'?'\n\nПри возврате части заказа Сплит сохранится для оставшихся товаров. После обработки возврата сервис пересчитает платежи.':'\n\nПосле обработки полного возврата обычный Сплит аннулируется автоматически, будущие платежи отменяются. Уже внесённые суммы сервис вернёт по своим правилам.';
  if(v.payment==='super')client+='\n\nВозврат покупки по Супер Сплиту сам по себе не закрывает кредитный договор. Изменения задолженности можно проверить в сервисе.';
 }
 const request={initial:'первичное обращение',refund:'возврат денег',replace:'обмен / замена',repair:'ремонт'}[v.request];
 const payment={card:'карта через ЮKassa',split:'Сплит',super:'Супер Сплит',other:'другой способ — уточнить'}[v.payment];
 let chat=`[${titles[v.case]} / ${request.toUpperCase()}]\n\nСделка: ${val('deal','[ссылка]')}\nТовар: ${model}\nДата обращения / требования: ${fmt(v.demand)}\n${v.request==='refund'?`Оплата: ${v.paid==='no'?'не оплачен':`${payment}, ${sum} ₽`}\n`:''}`;
 if(v.case==='retail')chat+=`Точка: ${val('store','[магазин]')}\nПодходящий аналог отсутствует: ${v.noAnalog==='yes'?'подтверждено точкой':'уточняем'}\n`;
 if(v.received)chat+=`Получен клиентом: ${fmt(v.received)}\n`;
 if(v.request==='replace')chat+=`Хочет получить: ${val('replacement','[модель, цвет]')}\nУсловия обмена: ${val('terms','уточняем')}\n`;
 if(!['cancel','pvz'].includes(v.case))chat+=`Причина / недостаток со слов клиента: ${val('reason','[описание]')}\n`;

 if(v.case!=='cancel')chat+=`Трек: ${val('track','ожидаем / уточняем')}\nПолучение магазином: ${v.shopReceived?fmt(v.shopReceived):'ещё не подтверждено'}\n`;
 if(v.case==='quality'&&v.request==='refund')chat+='Бланк: отправить клиенту / проверить заполнение.\n';
 if(v.payment==='split'||v.payment==='super')chat+=`${payment}: ${v.split==='partial'?'частичный':'полный'} возврат. Позиции: ${model}.\n`;
 chat+=`\n${c.basis}\n`+(c.due?`Крайняя дата контроля: ${deadline}.\nЗадача в amoCRM: ${fmt(c.reminder)}${c.reminderOverdue?' (дата уже прошла — поставить на сегодня)':''}.\n`:'Срок: '+(c.warning||'уточнить исходные даты / требование')+'.\n');
 const action={cancel:'Остановить отправку, подтвердить отмену'+(v.paid==='no'?'.':' и возврат оплаты.'),pvz:'Проверить отказ'+(v.paid==='no'?'.':' и оформить возврат оплаты, включая оплаченную доставку.'),quality:'Подтвердить получение и результат проверки, согласовать исполнение требования.',retail:'Подтвердить покупку и приём товара точкой, согласовать исполнение требования.',defect:'Посмотреть видео, сообщить дальнейшие действия и порядок передачи товара на проверку.',wrong:'Проверить ошибку и согласовать её исправление, включая доставку.'}[v.case];
 chat+='\nНужно: '+action;
 if(stage==='urgent'||stage==='waiting')client=`${name}, уточняю статус вашего обращения у ответственного. Сообщу вам подтверждённую информацию и дальнейшие действия.`;
 if(stage==='send')chat=`[ПЕРЕДАЧА НА ПРОВЕРКУ]\n${chat}\n\nИнструкция клиенту направлена. Условия отправки: ${val('terms','[согласованный порядок]')}. Ожидаем трек и получение товара.`;
 if(stage==='approved')chat+=`\n\nРешение Сергея: ${val('result','[согласованное решение]')}. Подтверждение: ${val('proof','[сообщение / документ]')}. Нужно исполнить в указанный срок.`;
 if(stage==='dispute')chat+=`\n\nРезультат проверки: ${val('result','[заключение]')}. Акт: ${val('proof','[ссылка]')}. Возражения клиента: [если есть].`;
 if(stage==='urgent')chat=`[СРОЧНО / КОНТРОЛЬ СРОКА]\n${chat}\n\nОжидаем: ${val('result','[проверку / решение / выплату]')}. Сергей, нужен статус и решение по следующему действию.`;
 if(stage==='waiting')chat=`[ОЖИДАЕМ ПЕРЕДАЧУ ТОВАРА]\n${chat}\n\nПередачу запросили: ${val('terms','[дата, предложенный способ]')}. Ответ клиента: ${val('result','[ответ]')}. Обращение не закрыто. Нужны дальнейшие действия.`;
 if(stage==='received')chat=`[ОБНОВЛЕНИЕ / ПОЛУЧЕНИЕ]\n${chat}\n\nСергей, прошу подтвердить получение и результат проверки.`;
 if(stage==='done')chat=`[ЗАВЕРШЕНО]\nСделка: ${val('deal','[ссылка]')}\nРезультат: ${v.paid==='no'&&v.case==='cancel'?'отмена без оплаты':request}\nСумма: ${sum} ₽\nДата выполнения: ${fmt(v.paidAt)}\nПодтверждение Сергея: ${val('proof','[сообщение / документ]')}\nКлиенту сообщили: [дата].\nЗакрыть после подтверждения выполнения.`;
 return {client,chat};
}
const api={parse,add,months,fmt,days,today,calculate,messages,form,address};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReturnsCore=api;
})(typeof window!=='undefined'?window:globalThis);
