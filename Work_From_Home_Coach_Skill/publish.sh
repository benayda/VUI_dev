\rm -fr lambda_upload.zip
zip -r lambda_upload.zip index.js problem_db.json node_modules 
aws lambda update-function-code --function-name WFHCoach --zip-file fileb://lambda_upload.zip
