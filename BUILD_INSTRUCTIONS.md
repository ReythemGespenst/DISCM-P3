How to run:

open the terminal at the root folder where the zip file is unzipped. 
Run "npm i" to install all the necessary packages

(Important) Make sure to create a "storage" folder with subfolders of any name inside the producer folder. Then fill each folder up with varying amounts and sizes of different videos with the following extensions: .mp4, .mkv, .mov, .avi, .webm

User inputs:
    The user can input the number of producer threads, consumer threads, and the queue size at docker-compose.yml. Just change the following environment variables: CONSUMER_THREADS, QUEUE_SIZE, PRODUCER_THREADS

Once you're ready, open the terminal at the root folder where you unzipped the zip file the project is contained in. Run the following command to start:
docker compose up --build

afterwards, you can find the GUI being hosted at localhost:3000

If you want to clean up the automatically generated storage directory in consumer, run 
npm run clean 
to clean up the storage
