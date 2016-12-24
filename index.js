var RtmClient = require('@slack/client').RtmClient;
var RTM_CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS.RTM;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;

var https = require('https');

var bot_token = require('./configuration').SLACK_BOT_TOKEN || '';

var sentiment = require('./sentiment');

var rtm = new RtmClient(bot_token);

var channelId;
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
            channelId = channel.id;
        }

        if (readHistory &&
            (channel.name === "general" ||
             channel.name === "random")) {
            getMessages(bot_token, channel.id, function(responseBody) {
                responseObject = JSON.parse(responseBody);
                if ('messages' in responseObject) {
                    for (var j = 0; j < responseObject.messages.length; j++) {
                        sentiment.processText(responseObject.messages[j].text);
                    }
                }
            });
        }
    }
});

rtm.on(RTM_CLIENT_EVENTS.RTM_CONNECTION_OPENED, function() {
    if (!isPassive) {
        rtm.sendMessage(sentiment.generateMessage(), channelId);
    }
});



rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {
    if (message.user !== selfId) {
        console.log('Message:', message); //this is no doubt the lamest possible message handler, but you get the idea
        if (message.text) {
           if (-1 != message.text.search(selfId)) {
                // Bot was mentioned
                var mention = '<@' + selfId + '>';
                stringWithoutId = message.text.replace(mention, '').trim();
                rtm.sendMessage(sentiment.generateMessage(stringWithoutId), message.channel);
            } else {
                sentiment.processText(message.text);
                sentiment.save();
                if (!isPassive) {
                    rtm.sendMessage(sentiment.generateMessage(), message.channel);
                } else {
                    rtm.sendMessage(sentiment.generateMessage(), channelId);
                }
            }
        }
        else {
            console.log('Ignoring message because it had no text: ', message);
        }
    } else {
        console.log('Ignoring message because came from self: ', message);
    }
});

sentiment.setup();

rtm.start();




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