'use strict';

var http = require('http');
var aws4 = require('aws4');
var url = require('url');

function SQS(config) {
    this.opts = {
        region: config.region,
        host: url.parse(config.queueURL).host,
        path: url.parse(config.queueURL).path
    };

    this.credentials = {
        secretAccessKey: config.privateKey,
        accessKeyId: config.accessKey
    };

    this.maxNumberOfMessages = config.maxNumberOfMessages;
    this.receiveSignature = null;
    this.deleteSignature = null;
}

SQS.prototype.getHost = function getHostSQS(url){
    return url.substring(0,url.indexOf('/'));
};

SQS.prototype.getPath = function getPathSQS(url) {
    return url.substring(url.indexOf('/'));
};

SQS.prototype.sendMessage = function sendMessageSQS(message, cb) {
    var action = '?Action=SendMessage&MessageBody=' + encodeURIComponent(message) + '&Version=2012-11-05';
    if(!this.sendMessageSignature) {
        this.sendMessageSignature = {region: this.opts.region, host: this.opts.host, path: this.opts.path + action};
        this.sign(this.sendMessageSignature);
    }

    var self = this;
    this.makeRequest(this.sendMessageSignature, function(err, body) {
        if(err) {
            return cb(err);
        }

        if (body.indexOf('SignatureDoesNotMatch</Code><Message>Signature expired:') !== -1) {
            self.sendMessageSignature = null;
            return self.sendMessage(cb);
        }
        cb(err, body);
    });
};

SQS.prototype.receiveMessages = function receiveMessagesSQS(cb) {
    var action = '?Action=ReceiveMessage&MaxNumberOfMessages=' + this.maxNumberOfMessages + '&AttributeName=All;&Version=2012-11-05';
    if(!this.receiveSignature) {
        this.receiveSignature = {region: this.opts.region, host: this.opts.host, path: this.opts.path + action};
        this.sign(this.receiveSignature);
    }
    var self = this;
    this.makeRequest(this.receiveSignature, function(err, body) {
        if(err) {
            return cb(err);
        }
        if (body.indexOf('SignatureDoesNotMatch</Code><Message>Signature expired:') !== -1) {
            self.receiveSignature = null;
            return self.receiveMessages(cb);
        }
        cb(err, self.parseMessage(body));
    });
};

SQS.prototype.deleteMessage = function deleteMessageSQS(handle, cb) {
    var action = '?Action=DeleteMessage&ReceiptHandle=' + encodeURIComponent(handle) + '&Version=2012-11-05';
    this.deleteSignature = {region: this.opts.region, host: this.opts.host, path: this.opts.path + action};
    this.sign(this.deleteSignature);

    this.makeRequest(this.deleteSignature, function(err, body) {
        if(err) {
            return cb(err);
        }

        cb(null, body);//TODO: parse the message to JSON

    });

};
/**
 * Change the role of the employee.
 * @param {integer} employeeId The id of the employee.
 * @param {string} [newRole] The new role of the employee.
 */
SQS.prototype.parseMessage = function parseMessageSQS(text) {
    var messageR = /<Message>(.*?)<\/Message>/gmi;
    var bodyR = /<Body>(.*?)<\/Body>/gmi;
    var signatureR = /<ReceiptHandle>(.*?)<\/ReceiptHandle>/gmi;
    var messageIdR = /<MessageId>(.*?)<\/MessageId>/gmi;
    var messages = [];
    var m;

    while ((m = messageR.exec(text)) !== null) {
        if (m.index === messageR.lastIndex) {
            messageR.lastIndex++;
        }

        var mess = bodyR.exec(m[0]);
        var receipt = signatureR.exec(m[0]);
        var messId = messageIdR.exec(m[0]);
        if (mess && mess.length > 0) {
            messages.push({message: this.unscape(mess[1]), receiptHandle: receipt[1], messageId: messId[1]});

            bodyR.lastIndex = 0;
            signatureR.lastIndex = 0;
            messageIdR.lastIndex = 0;
        } else {
            console.log(m);
        }
    }

    return messages;
};

SQS.prototype.makeRequest = function makeRequestSQS(opts, cb) {
    http.get(opts, function(res) {
        res.setEncoding('utf8');
        var body = '';
        res.on('data', function(d) {
            body += d;
        });
        res.on('end', function() {
            cb(null, body);
        });
    }).on('error', function(err) {
        console.error('Error with the request:', err.message);
        cb(err);
    });
};

SQS.prototype.text = function textSQS(xml, tag) {
    var i = xml.indexOf('<'+tag+'>');
    if (i === -1) return null;
    i += tag.length+2;

    return xml.substring(i, xml.indexOf('</', i));
};

SQS.prototype.unscape = function unscapeSQS(xml) {
    return xml.replace(/&quot;/g, '"').replace(/$apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
};

SQS.prototype.sign = function sign(opts) {
    aws4.sign(opts, this.credentials);
};

module.exports = SQS;
