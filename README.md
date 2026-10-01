# Slack sidebar · Vanilla JS + MongoDB Atlas

Canales y mensajes. Node `http` nativo.
Colecciones Atlas: `slack.channels` y `slack.messages`.

## Cloud Run

```bash
export GCP_PROJECT_ID=project-778283d9-dc7e-4c2c-947
export MONGODB_URI="mongodb+srv://dani:dany2233@cluster0.rqkadaa.mongodb.net/slack?retryWrites=true&w=majority&authSource=admin&appName=Cluster0"

gcloud run deploy slack-sidebar-vanilla \
  --project $GCP_PROJECT_ID \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --update-env-vars="MONGODB_URI=${MONGODB_URI},MONGODB_DB=slack"
```

`/health` tiene que decir `"store":"mongodb"`.
