var RtmClient = require('@slack/client').RtmClient;
var RTM_CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS.RTM;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;

var https = require('https');

var bot_token = require('./configuration').SLACK_BOT_TOKEN || '';

var sentiment = require('./sentiment');

var rtm = new RtmClient(bot_token);

var testChannelId;
var selfId;
var isPassive = true;
var readHistory = true;

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload if you want to cache it
rtm.on(RTM_CLIENT_EVENTS.AUTHENTICATED, function (rtmStartData) {
    console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);
    selfId = rtmStartData.self.id;
    for (var i = 0; i < rtmStartData.channels.length; i++) {
        channel = rtmStartData.channels[i];
        if (channel.name === "testing") {
            testChannelId = channel.id;
        }

        if (readHistory &&
            (channel.name === "general" ||
             channel.name === "random")) {
            getMessages(bot_token, channel.id, function(responseBody) {
                responseObject = JSON.parse(responseBody);
                if ('messages' in responseObject) {
                    for (var j = 0; j < responseObject.messages.length; j++) {
                        var message = responseObject.messages[j];
                        processNewMessage(message, false);
                    }
                }
            });
        }
    }
});

rtm.on(RTM_CLIENT_EVENTS.RTM_CONNECTION_OPENED, function() {
    if (!isPassive) {
        rtm.sendMessage(sentiment.generateMessage(), testChannelId);
    }
});

rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {
    processNewMessage(message, true);
});

function processNewMessage(message, allowResponse) {
    if (message.subtype) {
        console.log ('Ignoring message because it had a subtype.');
    } else if (message.user !== selfId) {
        console.log('Message:', message);
        if (message.text) {
           if (-1 != message.text.search(selfId)) {

                // Clean the bot mention from the message. Leaving this in leads to
                // the bot starting its response with a mention and ignoring the
                // rest of the message. Ideally there would be another
                // way to trigger the bot.
                var newMessageText = message.text.replace('<@' + selfId + '>', '').trim();

                if (newMessageText.length > 0) {
                    // Injest the message without the mention of self at the beginning since that
                    // tends to limit responses.
                    sentiment.processText(newMessageText);
                    sentiment.save();
                }

                if (allowResponse) {
                    rtm.sendMessage(sentiment.generateMessage(newMessageText), message.channel);
                }
            } else {
                sentiment.processText(message.text);
                sentiment.save();
                if (allowResponse) {
                    if (!isPassive) {
                        rtm.sendMessage(sentiment.generateMessage(), message.channel);
                    } else {
                        rtm.sendMessage(sentiment.generateMessage(), testChannelId);
                    }
                }
            }
        }
        else {
            console.log('Ignoring message because it had no text: ', message);
        }
    } else {
        console.log('Ignoring message because came from self: ', message);
    }
}

function getMessages(token, channelId, callback) {

    var options = {
        host: 'slack.com',
        path: `/api/channels.history?token=` + token + `&channel=` + channelId
    }

    var responseBody = "";

    https.request(options, function(response) {
        response.on('data', function(text) {
            responseBody += text;
        });
        response.on('end', function() {
            callback(responseBody);
        });
    }).end();
}

sentiment.setup();

rtm.start();