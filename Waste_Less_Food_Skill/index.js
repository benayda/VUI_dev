'use strict';

var winston = require('winston');

var logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({ prettyPrint: true, timestamp: true, json: false, stderrLevels:['error']})
    ]
  });

var intentHandlers = {};

if(process.env.NODE_DEBUG_EN) {
  logger.level = 'debug';
}


exports.handler = function (event, context) {
    try {

        logger.info('event.session.application.applicationId=' + event.session.application.applicationId);

        if (APP_ID !== '' && event.session.application.applicationId !== APP_ID) {
            context.fail('Invalid Application ID');
         }
      
        if (!event.session.attributes) {
            event.session.attributes = {};
        }

        logger.debug('Incoming request:\n', JSON.stringify(event,null,2));

        if (event.session.new) {
            onSessionStarted({requestId: event.request.requestId}, event.session);
        }


        if (event.request.type === 'LaunchRequest') {
            onLaunch(event.request, event.session, new Response(context,event.session));
        } else if (event.request.type === 'IntentRequest') {
            var response =  new Response(context,event.session);
            if (event.request.intent.name in intentHandlers) {
              intentHandlers[event.request.intent.name](event.request, event.session, response,getSlots(event.request));
            } else {
              response.speechText = 'Unknown intent';
              response.shouldEndSession = true;
              response.done();
            }
        } else if (event.request.type === 'SessionEndedRequest') {
            onSessionEnded(event.request, event.session);
            context.succeed();
        }
    } catch (e) {
        context.fail('Exception: ' + getError(e));
    }
};

function getSlots(req) {
  var slots = {}
  for(var key in req.intent.slots) {
    if(req.intent.slots[key].value !== undefined) {
      slots[key] = req.intent.slots[key].value;
    }
  }
  return slots;
}

var Response = function (context,session) {
  this.speechText = '';
  this.shouldEndSession = true;
  this.ssmlEn = true;
  this._context = context;
  this._session = session;

  this.done = function(options) {

    if(options && options.speechText) {
      this.speechText = options.speechText;
    }

    if(options && options.repromptText) {
      this.repromptText = options.repromptText;
    }

    if(options && options.ssmlEn) {
      this.ssmlEn = options.ssmlEn;
    }

    if(options && options.shouldEndSession) {
      this.shouldEndSession = options.shouldEndSession;
    }

    this._context.succeed(buildAlexaResponse(this));
  }

  this.fail = function(msg) {
    logger.error(msg);
    this._context.fail(msg);
  }

};

function createSpeechObject(text,ssmlEn) {
  if(ssmlEn) {
    return {
      type: 'SSML',
      ssml: '<speak>'+text+'</speak>'
    }
  } else {
    return {
      type: 'PlainText',
      text: text
    }
  }
}

function buildAlexaResponse(response) {
  var alexaResponse = {
    version: '1.0',
    response: {
      outputSpeech: createSpeechObject(response.speechText,response.ssmlEn),
      shouldEndSession: response.shouldEndSession
    }
  };

  if(response.repromptText) {
    alexaResponse.response.reprompt = {
      outputSpeech: createSpeechObject(response.repromptText,response.ssmlEn)
    };
  }

  if(response.cardTitle) {
    alexaResponse.response.card = {
      type: 'Simple',
      title: response.cardTitle
    };

    if(response.imageUrl) {
      alexaResponse.response.card.type = 'Standard';
      alexaResponse.response.card.text = response.cardContent;
      alexaResponse.response.card.image = {
        smallImageUrl: response.imageUrl,
        largeImageUrl: response.imageUrl
      };
    } else {
      alexaResponse.response.card.content = response.cardContent;
    }
  }

  if (!response.shouldEndSession && response._session && response._session.attributes) {
    alexaResponse.sessionAttributes = response._session.attributes;
  }
  logger.debug('Final response:\n', JSON.stringify(alexaResponse,null,2));
  return alexaResponse;
}

function getError(err) {
  var msg='';
  if (typeof err === 'object') {
    if (err.message) {
      msg = ': Message : ' + err.message;
    }
    if (err.stack) {
      msg += '\nStacktrace:';
      msg += '\n====================\n';
      msg += err.stack;
    }
  } else {
    msg = err;
    msg += ' - This error is not object';
  }
  return msg;
}

// Skill application ID from amazon developer portal
var APP_ID = 'amzn1.ask.skill.6a57a65b-5442-445d-b818-ca8bf2b68d7a';

function onSessionStarted(sessionStartedRequest, session) {
    logger.debug('onSessionStarted requestId=' + sessionStartedRequest.requestId + ', sessionId=' + session.sessionId);
      
}

function onSessionEnded(sessionEndedRequest, session) {
  logger.debug('onSessionEnded requestId=' + sessionEndedRequest.requestId + ', sessionId=' + session.sessionId);
   
}

function onLaunch(launchRequest, session, response) {
  logger.debug('onLaunch requestId=' + launchRequest.requestId + ', sessionId=' + session.sessionId);

  response.speechText = 'Hi, I am the Waste Less Food coach. With one point three billion tons of food wasted each year, the annual cost of worldwide food waste has now reached one trillion dollars! With over ninety percent of food wasted in the United States ending up in landfills, food waste has become one of the biggest contributors to greenhouse gases. Are you concerned about the environment? If so, how about doing your part to reduce food waste? You can ask me to recommend ways to reduce your own food waste when dealing with specific issues. For example, you can say how closely should I follow expiration dates, or what are some ideas to reduce food waste, or how do I know if food is spoiled, or what are some ideas to use up food?';
  response.repromptText = 'For example, you can say how closely should I follow expiration dates, or what are some ideas to reduce food waste, or how do I know if food is spoiled, or what are some ideas to use up food?';
  response.shouldEndSession = false;
  response.done();
}

var MAX_RESPONSES = 1;
var MAX_PROBLEMS = 2;

intentHandlers['GetWLFRecommendation'] = function(request,session,response,slots) {
 
  if(slots.Issue === undefined) {
    response.speechText = 'Looks like you forgot to mention what your issue is. What would you like help with? ';
    response.repromptText = 'For example, you can say, how closely should we follow expiration dates, or what are some ideas to reduce food waste, or how do I know if food is spoiled, or what are some ideas to use up food?';
    response.shouldEndSession = false;
    response.done();
    return;
  }

  var problemDb = require('./problem_db.json');
  
  var results = searchProblem(problemDb,slots.Issue);


  response.cardTitle = `Waste Less Food recommendation for: ${slots.Issue}`;
  response.cardContent = '';

  
  if(results.length==0) {
    response.speechText = `Could not find any Waste Less Food recommendation for ${slots.Issue}. I can research this issue or you can ask me about another issue. `;
    response.cardContent += response.speechText;
    response.shouldEndSession = false;
    response.done();
  } else {

    results.slice(0,MAX_RESPONSES).forEach( function(item) {
      response.speechText  += `Here is a recommendation for dealing with this issue. ${item[1]} `;
      response.speechText  += "Would you like help dealing with another issue? Or you can say stop or cancel to end the session."
      response.cardContent += `Here is a recommendation for dealing with this issue. ${item[1]}\n`;
      response.cardContent += "Would you like help dealing with another issue? Or you can say stop or cancel to end the session."
      
    });


    if(results.length > MAX_RESPONSES) {
      response.speechText += `There are more recommendations that might help you reduce food waste. You can say more information for more information. Or say stop or cancel to end the skill. `; 
      response.cardContent += `There are more recommendations that might help you reduce food waste. You can say more information for more information. Or say stop or cancel to end the skill. `; 
      response.repromptText = `You can say more information or stop.`; 
      session.attributes.resultLength = results.length;
      session.attributes.Problem = slots.Issue;
      session.attributes.results = results.slice(MAX_RESPONSES,MAX_PROBLEMS);
      response.shouldEndSession = false;
      response.done();

    } else {
      response.shouldEndSession = false;
      response.done();
    }


  }


}



intentHandlers['GetNextEventIntent'] = function(request,session,response,slots) {

  if(session.attributes.results) {
    response.cardTitle = `The Waste Less Food coach more information for: ${session.attributes.Issue}`;

    response.speechText  = `There are other ways to deal with this issue ${session.attributes.resultLength}.`;
    response.cardContent = `${response.speechText}\n`;


    session.attributes.results.forEach(function(item) {
      response.speechText += `${item[0]}. `; 
      response.cardContent += `'${item[0]}'\n`;
    });
  } else {
    response.speechText  = `Wrong invocation of this intent. `;
  }
  response.shouldEndSession = true;
  response.done();

};

intentHandlers['AMAZON.StopIntent'] = function(request,session,response,slots) {
  response.speechText  = `Good Bye. `;
  response.shouldEndSession = true;
  response.done();
};

intentHandlers['AMAZON.CancelIntent'] =  intentHandlers['AMAZON.StopIntent'];

intentHandlers['AMAZON.HelpIntent'] = function(request,session,response,slots) {
  response.speechText = "If you're concerned about the environment, you can ask the Waste Less Food coach to recommend ways you can reduce food waste, one of the biggest contributors to greenhouse gases. For a given issue, the Waste Less Food coach provides you with a recommendation to help you. For example, you can say how closely should I follow expiration dates, or what are some ideas to reduce food waste, or how do I know if food is spoiled, or what are some ideas to use up food? If the skill hasn't been opened yet, you can also say in one shot, Alexa, ask Waste Less Food how closely should I follow expiration dates, or Alexa, ask Waste Less Food how do I know if food is spoiled? What issue would you like help dealing with?";
  response.repromptText = "What issue would you like help dealing with? or You can say stop to stop the skill.";
  response.shouldEndSession = false;
  response.done();
}


function searchProblem(PDb, problemName) {
  problemName = problemName.toLowerCase();
  problemName = problemName.replace(/,/g, '');
  var problemWords = problemName.split(/\s+/);
  var regExps = []
  var searchResult = []


  problemWords.forEach(function(sWord) {
    regExps.push(new RegExp(`^${sWord}(es|s)?\\b`));
    regExps.push(new RegExp(`^${sWord}`));
  });

  PDb.forEach( function (item) {
    var match = 1;
    var fullName = item[0]
    var cmpWeight = 0;

    problemWords.forEach(function(sWord) {
      if(!fullName.match(sWord)) {
        match = 0;
      }
    });

    if(match==0) {
      return;
    }

    regExps.forEach(function(rExp) {
      if(fullName.match(rExp)) {
        cmpWeight += 10;
      }
    });

    if (fullName.split(/\s+/).length == problemWords.length) {
        cmpWeight += 10;
    }


    searchResult.push([item, cmpWeight]);

  });

  var finalResult = searchResult.filter(function(x){return x[1]>=10});
  if(finalResult.length == 0) {
    finalResult = searchResult;
  } else {
    finalResult.sort(function(a, b) {
        return b[1] - a[1];
    });
  }

  finalResult = finalResult.map(function(x) {
    return x[0]
  });

  return finalResult;
}





