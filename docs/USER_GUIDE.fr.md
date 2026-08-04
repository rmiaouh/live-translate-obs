# Guide utilisateur — Live Translate for OBS

Ce guide concerne la préversion Windows `v0.2.0-preview.4`.

## 1. Installation

1. Ouvrez la [page de la préversion](https://github.com/rmiaouh/live-translate-obs/releases/tag/v0.2.0-preview.4).
2. Téléchargez `Live-Translate-for-OBS-Setup.exe`.
3. La préversion n'étant pas signée, Windows SmartScreen peut afficher un avertissement. Vérifiez que le fichier vient bien de la page Releases officielle avant de choisir **Informations complémentaires**, puis **Exécuter quand même**.
4. Lancez l'application et ajoutez votre propre clé API OpenAI. Elle est chiffrée localement par Windows et n'est jamais ajoutée à l'URL OBS.

## 2. Choisir les sources audio

Dans **Direct**, choisissez votre microphone puis la source **Invités** :

- **Application Windows** : recommandé sous Windows 11 build 20348 ou plus récent. Choisissez Discord, Chrome, Zoom, etc. Seul le processus sélectionné et ses enfants sont capturés.
- **Tout le son Windows** : capture tout ce qui sort du périphérique audio par défaut, y compris musique et notifications.
- **Entrée audio dédiée** : utilise une entrée ou un câble virtuel comme VoiceMeeter, Sonar ou VB-Cable.

Pour Chrome, la capture peut regrouper ses processus enfants et donc plusieurs fenêtres. Si plusieurs applications différentes doivent être capturées ensemble, utilisez **Tout le son Windows** ou un mix virtuel.

Cliquez sur l'icône du microphone ou des invités pour couper/réactiver la source. Une source coupée devient rouge, affiche **Désactivé** et son vumètre reste à zéro. Cela fonctionne aussi pendant le direct, mais la session OpenAI reste ouverte et continue d'être facturée.

## 3. Mixé ou Séparé

- **Mixé** : une session, environ 2,04 $/h. Le micro et les invités sont fusionnés ; aucune identification visuelle fiable des locuteurs n'est annoncée.
- **Séparé** : deux sessions, environ 4,08 $/h. Le microphone alimente la carte **Hôte** et la source Windows/entrée alimente **Invités**. Les deux cartes peuvent apparaître simultanément.

La langue parlée est détectée automatiquement. Choisissez uniquement la langue de sortie. Le modèle utilisé reste `gpt-realtime-translate`.

## 4. Tester sans lancer de stream

1. Ouvrez Discord, une vidéo YouTube ou l'application à interviewer.
2. Dans Live Translate, cliquez sur **Tester les sources**.
3. Parlez : le vumètre Microphone doit bouger.
4. Faites jouer du son dans l'application invitée : le vumètre Invités doit bouger.
5. Arrêtez le test, puis cliquez sur **Démarrer** pour vérifier la traduction dans l'aperçu local.

OBS n'a pas besoin d'être en direct pour ce test. Une source navigateur OBS peut aussi être prévisualisée sans démarrer de diffusion.

## 5. Ajouter les sous-titres dans OBS

1. Ouvrez **Installation OBS** dans l'application.
2. Cliquez sur **Copier**. Le bouton doit devenir **Copié !** et une confirmation doit apparaître.
3. Dans OBS, ajoutez une **Source navigateur**.
4. Collez l'URL, puis réglez la largeur sur `1920`, la hauteur sur `1080` et les FPS sur `30`.
5. Placez la source au-dessus de la caméra ou du partage d'écran.

L'URL contient un jeton local : ne la publiez pas dans une capture d'écran ou un dépôt public. Elle reste identique après redémarrage afin de ne pas casser les scènes OBS existantes.

## 6. Apparence

- **Pages** convient aux phrases longues et affiche successivement tout le texte sans couper les mots.
- **Roll-up** pousse les anciennes lignes vers le haut.
- **Grand**, **Équilibré** et **Plus de texte** couvrent les usages principaux ; **Custom** règle uniquement la taille et la largeur.

Les listes se repositionnent automatiquement pour rester au-dessus de la barre inférieure. Si une liste contient beaucoup d'éléments, utilisez la molette ou les boutons de défilement.

## 7. Dépannage Windows

### Aucun son Invités

- Vérifiez qu'un son est réellement joué dans l'application sélectionnée.
- Cliquez sur **Actualiser les applications** après avoir ouvert Discord/Chrome/Zoom.
- Vérifiez que l'icône Invités n'est pas rouge.
- Essayez **Tout le son Windows** pour distinguer un problème d'application d'un problème de sortie audio.
- Sous Windows 10 ou une build antérieure à 20348, utilisez le mix Windows ou une entrée dédiée.

### « En attente de Discord/Chrome… »

L'application sélectionnée est fermée ou a redémarré. Live Translate recherche automatiquement sa nouvelle instance. Ouvrez-la et lancez un son.

### L'URL OBS ne montre rien

- Live Translate doit rester ouvert : le serveur est local à `127.0.0.1`.
- Recopiez l'URL depuis **Installation OBS**.
- Vérifiez que le nombre de clients OBS connectés passe à `1`.
- Rechargez la source navigateur dans OBS.

### Windows bloque l'installation

Cette préversion n'est pas signée. La distribution publique nécessitera une signature Authenticode. Ne contournez SmartScreen que pour un fichier téléchargé depuis la page Releases officielle.

## 8. Vie privée

Aucun audio ni sous-titre n'est enregistré par l'application. Les flux sélectionnés sont envoyés directement à OpenAI pendant la traduction. Les diagnostics locaux excluent les clés, les jetons et le texte traduit. Consultez également [PRIVACY.md](../PRIVACY.md) et [SECURITY.md](../SECURITY.md).
