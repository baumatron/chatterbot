"use strict";

var utilities = require('./utilities');
var fs = require('fs');

// Ideas
// Could separate analysis based on who said something
// Could create union of analysis to get words that are important to the whole group
// Could use markov chaining to mock users
// Could post results of web searches based on markov chaining and important group words
//      Make it like a link of the day or something.

// TODO: Need to incorporate start and end of message as a state. Then to start can just choose from the start message state, and end once an end message state has been reached.
// TODO: https://api.slack.com/methods/channels.history to get message history.

function filterSlackText(inputText) {
    var userTimestampRegex = /.*\[\d*:\d*.*\].*/g;
    var dateDividerRegex = /-{5}.*-{5}/g;
    var garbageRegex = /[•()]/g;
    var whitespaceRegex = /\s+/g;
    return inputText.toLowerCase()
        .replace(userTimestampRegex, "")
        .replace(dateDividerRegex, "")
        .replace(garbageRegex, "")
        .replace(whitespaceRegex, " ");
}

function normalizeWhitespace(inputText) {
    var whitespaceRegex = /\s+/g;
    return inputText
        .replace(whitespaceRegex, " ");
}

function TextData() {

    // TODO: Should only save this.text and then generate everything from that text on demand (after loading, after appending)
    var self = this;
    this.text = [];
    this.words = [];
    this.wordCounts = {};
    this.wordData = [];

    function computeWordRarity(wordFrequency, corpusWordCount) {
        return 1 - wordFrequency / corpusWordCount;
    }

    this.getSeedSequences = function(n) {
        // This function takes a string of input text, divides it up into word tokens,
        // Then creates a list of the frequencies of each occurance of each word
        var sentenceRegex = /(?:\n|^|[.?!]\s+)([-;:,A-z\s]+)[.?!]/g;
        var seedSequences = [];
        var matches;
        while ((matches = sentenceRegex.exec(self.text)) !== null) {
            var match = matches[1];
            if (match.length >= n) {
                seedSequences.push(match.substr(0, n));
            }
        }

        return seedSequences;
    }

    this.getTerminalGrams = function(order) {
        // This function takes a string of input text, divides it up into word tokens,
        // Then creates a list of the frequencies of each occurance of each word
        var lastWordOfSentenceRegex = /\s+([A-z]+[.?!])/g;
        var terminalGrams = {};
        var matches;
        while ((matches = lastWordOfSentenceRegex.exec(self.text)) !== null) {
            var terminalWord = matches[1];
            while (terminalWord.length < order) {
                terminalWord = " " + terminalWord;
            }

            terminalGrams[terminalWord.substr(terminalWord.length - order, order)] = true;
        }

        return terminalGrams;
    }

    this.processText = function(inputText) {
        // This function takes a string of input text, divides it up into word tokens,
        // Then creates a list of the frequencies of each occurance of each word
        this.text += "\n" + inputText;
        var inputWords = inputText.toLowerCase().replace(/[.?!,]/g, "").split(" ");

        // Count the occurences of each word
        for (var i = 0; i < inputWords.length; i++) {
            if (!this.wordCounts[inputWords[i]]) {
                this.wordCounts[inputWords[i]] = 1;
            } else {
                this.wordCounts[inputWords[i]]++;
            }
            // Add the word to our list of words
            this.words.push(inputWords[i]);
        }

        // Put the word data in a sortable list
        // An alternative to this is to use a max heap
        this.wordData = [];
        for (var word in this.wordCounts) {
            this.wordData.push({
                word: word,
                count: this.wordCounts[word],
                rarity: computeWordRarity(this.wordCounts[word], this.words.length)
            });
        }

        // Sort the list
        this.wordData.sort(function compare(a, b) {
            return b.rarity - a.rarity;
        });
    }
}

function MarkovData(order) {
    var self = this;
    this.order = order;
    this.gramNextStates = {};

    this.processText = function(inputText) {
        for (var i = 0; i < inputText.length - self.order; i++) {
            var gram = inputText.substr(i, self.order);
            if (!self.gramNextStates[gram]) {
                self.gramNextStates[gram] = []
            }
            // TODO: May want to deal with end of message as a state
            self.gramNextStates[gram].push(inputText.substr(i+self.order, 1));
        }
    }

    this.generateText = function(seedSequence, terminalGrams) {
        var result = seedSequence;
        var gram = result.substr(result.length - self.order, result.length);
        while (true) {
            gram = result.substr(result.length - self.order, result.length);
            if (terminalGrams[gram] && Math.random() > 0.25) {
                break;
            }
            if (!self.gramNextStates[gram]) {
                console.log('Gram not found in markov data: ' + gram + ' Assuming terminal.');
                break;
            }
            result += utilities.randomElement(self.gramNextStates[gram]);
            if (result.length > 1000) {
                break;
            }
        }
        return result;
    }
}

function ExportModule() {
    var self = this;
    this.markovData = new MarkovData(6);
    this.markovDataFile = 'markovdata.txt';
    this.textData = new TextData();
    this.textDataFile = 'textdata.txt';

    this.save = function() {
        fs.writeFile(self.markovDataFile, JSON.stringify(self.markovData));
        fs.writeFile(self.textDataFile, JSON.stringify(self.textData));
    }

    this.load = function() {
        fs.readFile(self.markovDataFile, function(error, data) {
            if (!error && data.length > 0) {
                var jsonObject = JSON.parse(data);
                self.markovData = new MarkovData();
                for (var property in jsonObject) {
                    self.markovData[property] = jsonObject[property];
                }
            }
        });

        fs.readFile(self.textDataFile, function(error, data) {
            if (!error && data.length > 0) {
                var jsonObject = JSON.parse(data);
                self.textData = new TextData();
                for (var property in jsonObject) {
                    self.textData[property] = jsonObject[property];
                }
            }
        });
    }

    this.setup = function() {
        self.load();
    }

    this.processText = function(text) {
        var normalizedText = normalizeWhitespace(text);
        self.markovData.processText(normalizedText);
        self.textData.processText(normalizedText);
        self.save();
    }

    this.generateMessage = function(seedText) {

        var terminalGrams = self.textData.getTerminalGrams();
        var seedSequences = self.textData.getSeedSequences(self.markovData.order);

        var seedSequence;
        if (seedText) {
            if (seedText.length < self.markovData.order) {
                seedText += " ".repeat(self.markovData.order - seedText.length);
            }
            seedSequence = seedText.substr(0, self.markovData.order);
        } else {
            seedSequence = "";
        }
        // TODO: In theory this shouldn't be necessary, but for whatever reason
        //      a start sequence sometimes doesn't have probabilities. Should
        //      fix this.
        var tries = 0;
        while (!self.markovData.gramNextStates[seedSequence]) {
            seedSequence = utilities.randomElement(seedSequences);
            console.log('seedSequence :' + seedSequence);
            tries++;
            if (tries > 100) {
                console.log("Couldn't find a valid seed for generating text.");
                return "Sploded";
            }
        };

        return self.markovData.generateText(seedSequence, terminalGrams);
    }
}

module.exports = new ExportModule();