require('dotenv').config();

const Telegraf = require('telegraf');
const Extra = require('telegraf/extra');
const Markup = require('telegraf/markup');
const session = require('telegraf/session');
const request = require('request');
const leftPad = require("left-pad");

const loadingStickerURL = process.env.LOADING_STICKER_URL;
const stockAPIUrl = process.env.STOCK_API_URL;
const authorizedUserList = [parseInt(process.env.AUTHORIZED_USER)];
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());
bot.start((ctx) => startContext(ctx));
bot.help((ctx) => ctx.reply('Pay xxxx HKDyyy or xxxx.hk'));

bot.on('message', (ctx) => proceedMessage(ctx));
bot.action('confirm', (ctx) => proceedPayment(ctx));
bot.action('cancel', (ctx) => cancelPayment(ctx));
bot.startPolling();


function startContext(ctx) {
  if (!isAuthorized(ctx)) return;
  ctx.reply(`Welcome to Hailey bot`);
}


function proceedMessage(ctx) {
  if (!isAuthorized(ctx)) return;

  var paymentRegEx = new RegExp("Pay HKD(\\d*) to (.*)", "i");
  var stockRegEx = new RegExp("(\\d*).hk", "i");
  if (paymentRegEx.test(ctx.message.text)) {
    var msg = paymentRegEx.exec(ctx.message.text);
    ctx.session.txnAmt = msg[1];
    ctx.session.person = msg[2];

    ctx.message.text = "";
    ctx.message.text += `Recipient       : ${ctx.session.person}\n`;
    ctx.message.text += `Txn amount   : ${ctx.session.txnAmt}`;

    const keyboard = Markup.inlineKeyboard([
      Markup.callbackButton('Confirm ?', 'confirm'),
      Markup.callbackButton('Cancel ?', 'cancel'),
    ])
    ctx.telegram.sendCopy(ctx.from.id, ctx.message, Extra.markup(keyboard));
  } else if (stockRegEx.test(ctx.message.text)) {
    var msg = stockRegEx.exec(ctx.message.text);
    var stockQuote = msg[1];

    setTimeout(proceedStockQuote, 500, ctx, stockQuote);
    ctx.reply(`Just a moment please, fetching ${stockQuote}...`)

  } else {
    ctx.reply("I don't understand")
  }
}

function proceedPayment(ctx) {

  // Validate Payment Session
  if (!isValidPaymentSession(ctx)) {
    ctx.reply("Session have been expired. Please try again");
    return;
  }

  // Send Loading Sticker  
  ctx.telegram.sendSticker(ctx.update.callback_query.from.id, loadingStickerURL);

  // Proceed the Payment
  setTimeout(processRealPayment, 2000, ctx);
}

function cancelPayment(ctx) {
  // Validate Payment Session
  if (!isValidPaymentSession(ctx)) {
    ctx.reply("Session have been expired. Please try again");
    return;
  }

  clearSession(ctx);

  ctx.reply("Cancel payment");
}

function processRealPayment(ctx) {
  clearSession(ctx);

  // TODO
  ctx.reply("Completed");
}

function isValidPaymentSession(ctx) {
  return (ctx.session.person != null) && (ctx.session.txnAmt != null)
}

function isAuthorized(ctx) {
  if (authorizedUserList.length >= 0 && authorizedUserList.indexOf(ctx.message.from.id) == -1) {
    ctx.reply(`You are not allowed to speak here. Bye`);
    return false;
  }
  return true;
}

function clearSession(ctx) {
  for (var prop in ctx.session) {
    delete ctx.session[prop];
  }
}

function proceedStockQuote(ctx, stockQuote) {
  let url = stockAPIUrl.replace("<%STOCK_QUOTE%>", leftPad(stockQuote, 5, "0"));
  console.log(url);
  request.get(url,
    function (error, response, body) {
      price = JSON.parse(body).dataset.data[0][1];
      symbol = JSON.parse(body).dataset.name;
      return ctx.reply(`${ symbol } : $${ price }`);
    }
  )
}