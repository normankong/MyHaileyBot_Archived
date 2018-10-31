'use strict';

require('dotenv').config();

const automl = require('@google-cloud/automl').v1beta1;
var PropertiesReader = require('properties-reader');
var foodMapping = PropertiesReader('./data/food_mapping.txt');

const predictServiceClient = new automl.PredictionServiceClient();
const PROJECT_ID = process.env.GCLOUD_PROJECT ? process.env.GCLOUD_PROJECT : process.env.PROJECT_ID; 
const REGION_NAME = process.env.REGION_NAME ? process.env.REGION_NAME : process.env.COMPUTE_REGION;
const MODEL_ID = process.env.MODEL_ID; 
const SCORE_THRESHOLD = process.env.SCORE_THRESHOLD ? process.env.SCORE_THRESHOLD : "0.5";

function predict(buffer, cb, cbParam){
	console.log("===============================================")
	console.log(`Incoming Image : ${buffer.length} bytes`);
	console.log("===============================================")

	// Connect to GCP Prediction Service
	const modelFullId = predictServiceClient.modelPath(PROJECT_ID, REGION_NAME, MODEL_ID);

	// Read the file content for prediction.
	const content = buffer;
	const params = {};
	params.score_threshold = SCORE_THRESHOLD;

	// Set the payload by giving the content and type of the file.
	const payload = {};
	payload.image = {
		imageBytes: content
	};

	console.log("Trigger Prediction", PROJECT_ID, REGION_NAME, MODEL_ID, SCORE_THRESHOLD);

	predictServiceClient
		.predict({
			name: modelFullId,
			payload: payload,
			params: params
		})
		.then(responses => {
			console.log(`Prediction results:`);
			var result = "";
			for (var i = 0; i < responses[0].payload.length; i++) {
				var item = responses[0].payload[i];
				var score = (item.classification.score * 100).toFixed(4);
				var foodDetail = getFoodDetail(item);
				result += `Result :  ${foodDetail.displayName}\nScore : ${score}% \nCalories : ${foodDetail.calories} \nRecommendation : ${foodDetail.recommendation}`;
			}
			if (result === "") result = "Unable to detect this object. What is it ?";
            console.log(result);
            
            if (cb) { cb(result, cbParam)}

		})
		.catch(err => {
			
			console.error(err);
			cb(err);
		})
		.then(() => {
			// logEvent.compTime = new Date().toJSON();
			// addEvent(logEvent);
		});

};


function getFoodDetail(item) {
	var detail = {};
    var tmp = foodMapping.get(item.displayName);
	if (tmp == null)
	{
		detail.displayName = item.displayName;
		detail.calories = 100;
		detail.recommendation = "Eat";
	}
	else{
		detail.displayName = tmp.split(",")[0];
		detail.calories = tmp.split(",")[1];
		detail.recommendation = tmp.split(",")[2];
	}
	return detail;
}



exports.predict = predict;