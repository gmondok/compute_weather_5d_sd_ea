const { Requester, Validator } = require('@chainlink/external-adapter')


// Define custom error scenarios for the API.
// Return true for the adapter to retry.
const customError = (data) => {
  if (data.Response === 'Error') return true
  return false
}

// Define custom parameters to be used by the adapter.
// Extra parameters can be stated in the extra object,
// with a Boolean value indicating whether or not they
// should be required.
const customParams = {
  lat: 'lat',
  lon: 'lon',
  endpoint: false
}

const createRequest = (input, callback) => {
  // The Validator helps you validate the Chainlink request data
  const validator = new Validator(callback, input, customParams)
  const jobRunID = validator.validated.id
  const endpoint = validator.validated.data.endpoint || 'timemachine'
  const url = `https://api.openweathermap.org/data/2.5/onecall/${endpoint}`
  const lat = validator.validated.data.lat
  const lon = validator.validated.data.lon
  var date = new Date();
  var dt = Math.floor(date.getTime() / 1000);
  const appid = process.env.API_KEY;
  console.log(appid);
  var tempArray = [];

  //loop for 5 requests (5 days of data)
  for (i = 0; i < 5; i++) {
    var  params = {
      lat,
      lon,
      dt,
      appid
    }

    var config = {
      url,
      params
    }

    // The Requester allows API calls be retry in case of timeout
    // or connection failure
    Requester.request(config, customError)
    .then(response => {
      //Store average temp data from this day (average across 24hrs)
      var sum = 0;
      for (j = 0; j < 24; j++) {
        sum = sum + response.data.hourly[j].temp;
      }
      tempArray[i] = sum/24;
    })
    .catch(error => {
      callback(500, Requester.errored(jobRunID, error))
    })
    //Subtract 1d in seconds each loop
    dt = dt - 86400;
  }

  //tempArray is now populated with 5d of average temps
  //Calc standard deviation of prev 4 days
  let calc = calcStandardDev(tempArray);
  const mean = calc[0];
  const sd = calc[1];


  //Report if current day is > 1/2 standard deviation from mean
  var result = false;
  if ((tempArray[0] > sd/2 + mean) || (tempArray[0] < mean - sd/2)) {
    result = true;
  }
 // console.log(statusSum);
  callback(200,
    {
      "id": jobRunID,
      "data": {"answer": result}
    });
}

//Calculates standard deviation of an array of data, in this case, temperatures
//Returns mean and sd in an array
function calcStandardDev(temps) {
  var tmp = 0;
  for (i = 1; i < temps.length; i++) {
    tmp = tmp + temps[i];
  }
  const mean = tmp/(temps.length-1);
  var diffArray = [];
  for (i =1; i < temps.length; i++) {
    diffArray[i] = Math.pow((temps[i]-mean), 2);
  }
  var variance = 0;
  for (i =1; i < temps.length; i++) {
    variance = variance + diffArray[i];
  }
  variance = variance/(temps.length-1);
  return [mean, Math.sqrt(variance)];
}

// This is a wrapper to allow the function to work with
// GCP Functions
exports.gcpservice = (req, res) => {
  createRequest(req.body, (statusCode, data) => {
    res.status(statusCode).send(data)
  })
}

// This is a wrapper to allow the function to work with
// AWS Lambda
exports.handler = (event, context, callback) => {
  createRequest(event, (statusCode, data) => {
    callback(null, data)
  })
}

// This is a wrapper to allow the function to work with
// newer AWS Lambda implementations
exports.handlerv2 = (event, context, callback) => {
  createRequest(JSON.parse(event.body), (statusCode, data) => {
    callback(null, {
      statusCode: statusCode,
      body: JSON.stringify(data),
      isBase64Encoded: false
    })
  })
}

// This allows the function to be exported for testing
// or for running in express
module.exports.createRequest = createRequest
