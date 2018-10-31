require('dotenv').config();

const Telegraf = require('telegraf');
const Extra = require('telegraf/extra');
const Markup = require('telegraf/markup');
const session = require('telegraf/session');
const request = require('request');
const leftPad = require("left-pad");
const express = require('express');
const https = require("https");
const vision = require("./lib/vision.js");

const loadingStickerURL = process.env.LOADING_STICKER_URL;
const stockAPIUrl = process.env.STOCK_API_URL;
const authorizedUserList = [parseInt(process.env.AUTHORIZED_USER)];
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());
bot.start((ctx) => startContext(ctx));
bot.help((ctx) => ctx.reply('Pay xxxx HKDyyy or xxxx.hk'));

bot.on('sticker', (ctx) => ctx.reply('👍'))
bot.on('message', (ctx) => proceedMessage(ctx));
bot.action('confirm', (ctx) => proceedPayment(ctx));
bot.action('cancel', (ctx) => cancelPayment(ctx));

bot.startPolling();

function startContext(ctx) {
  if (!isAuthorized(ctx)) return;
  ctx.reply(`Welcome to Hailey bot`);
}


function proceedMessage(ctx) {

  // Check Authorization
  if (!isAuthorized(ctx)) return;


  // Proceed Vision AI
  if (ctx.update.message.photo != null) {
    proceedVisionAI(ctx);
    return;
  }


  console.log(ctx.message.text);

  // Proceed Payment
  var paymentRegEx = new RegExp("Pay HKD(\\d*) to (.*)", "i");
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
    return;
  }

  // Proceed Stock Quote
  var stockRegEx = new RegExp("(\\d*).hk", "i");
  if (stockRegEx.test(ctx.message.text)) {
    var msg = stockRegEx.exec(ctx.message.text);
    var stockQuote = msg[1];

    ctx.reply(`Just a moment please, fetching ${stockQuote}...`)
    setTimeout(proceedStockQuote, 100, ctx, stockQuote);
    return;
  }

  // Default Handling
  ctx.reply("I don't understand");

}

/**
 * Proceed Google Vision Determinatino
 * @param {Telegram Context} ctx 
 */
function proceedVisionAI(ctx) {

  ctx.reply("One moment please....")
  var fileID;
  for (var i = 0; i < ctx.update.message.photo.length; i++) {
    var photo = ctx.update.message.photo[i];
    var width = photo.width;
    var height = photo.height;
    fileID = photo.file_id;
    if (width >= 400) {
      break;
    }
  }

  if (fileID != null) {
    var handler = ctx.telegram.getFile(fileID);
    handler.then(function (v) {
      var url = (`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${v.file_path}`);
      proceedDownloadAndPredict(ctx, url)
    });
  }
  else{
    ctx.reply("File is somehow error");
  }
}

/**
 * Proceed Payment
 * @param {Telegram Context} ctx 
 */
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

/**
 * Validate Payment Session
 * @param {Context} ctx 
 */
function isValidPaymentSession(ctx) {
  return (ctx.session.person != null) && (ctx.session.txnAmt != null)
}

/**
 * Is Authorized User
 * @param {Telegram Context} ctx 
 */
function isAuthorized(ctx) {
  if (authorizedUserList.length >= 0 && authorizedUserList.indexOf(ctx.message.from.id) == -1) {
    ctx.reply(`You are not allowed to speak here. Bye`);
    return false;
  }
  return true;
}

/**
 * Clear Session
 * @param {Context} ctx 
 */
function clearSession(ctx) {
  for (var prop in ctx.session) {
    delete ctx.session[prop];
  }
}

/**
 * Proceed Stock Quote
 * @param {Telegram Context} ctx 
 * @param {Stock Tick} stockQuote 
 */
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


/**
 * Download user upload file then submit to Google Vision
 * @param {URL for the image} url 
 * @param {Telegram Context} ctx 
 */
const downloadByURL = function (ctx, url) {
  var buffer = Buffer.alloc(0);
  console.log(`Download from ${url}`);
  // var file = fs.createWriteStream(dest);
  var request = https.get( url, function (response) {
    response.on('end', () => {
      console.log(`Download completed ${buffer.length}`);
      vision.predict(buffer, function(result)
      {
        ctx.reply(result);
      });
    });
    response.on('data', (d) => {
      // console.log(d, d.length)
      buffer =  Buffer.concat([buffer, Buffer.from(d, "binary")]);
    });
  }).on('error', function (err) { // Handle errors
    console.log(err)
  });
};

const app = express();

app.get('/', function (req, res) {
  res.send('Hello world');
});


if (module === require.main) {
  const server = app.listen(process.env.PORT || 8080, () => {
    const port = server.address().port;
    console.log("=====================================================");
    console.log(`App listening on port at ${port}`);
    console.log("=====================================================");
  });
}

module.exports = app;