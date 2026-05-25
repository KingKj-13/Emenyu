# stt.py (Final Version for Stable and Clean STT)

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from dotenv import dotenv_values
import os
import time

# Load environment variables
env_vars = dotenv_values(".env")
InputLanguage = env_vars.get("InputLanguage", "en-US")

# HTML code for Web Speech API
HtmlCode = """<!DOCTYPE html>
<html lang="en">
<head>
    <title>Speech Recognition</title>
</head>
<body>
    <button id="start" onclick="startRecognition()" style="display:none;">Start Recognition</button>
    <button id="end" onclick="stopRecognition()" style="display:none;">Stop Recognition</button>
    <p id="output"></p>
    <script>
        const output = document.getElementById('output');
        let recognition;
        let final_transcript = '';

        function startRecognition() {
            recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            recognition.lang = '';
            recognition.continuous = true;
            recognition.interimResults = true; 

            recognition.onresult = function(event) {
                final_transcript = '';
                
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        final_transcript += event.results[i][0].transcript;
                    }
                }
                output.textContent = final_transcript.trim(); 
            };

            recognition.onerror = function(event) {
                 console.error('Recognition error: ' + event.error);
                 recognition.stop(); 
            };
            
            recognition.onend = function() {
                 console.log('Recognition ended. Restarting...');
                 setTimeout(() => recognition.start(), 100); 
            };

            recognition.start();
        }

        function stopRecognition() {
            output.textContent = ''; 
        }

        document.addEventListener('DOMContentLoaded', startRecognition);

    </script>
</body>
</html>"""

# Inject language dynamically
HtmlCode = HtmlCode.replace("recognition.lang = '';", f"recognition.lang = '{InputLanguage}';")

class STT:
    
    POLL_DELAY_SECONDS = 0.5 
    
    def __init__(self):
        print("STT: Initializing Selenium...")
        try:
            os.makedirs("Data", exist_ok=True)
            html_file_path = os.path.join(os.getcwd(), "Data", "Voice.html")
            with open(html_file_path, "w", encoding="utf-8") as f:
                f.write(HtmlCode)
            
            self.file_link = "file:///" + html_file_path
            self.InputLanguage = InputLanguage

            chrome_options = Options()
            chrome_options.add_argument("--use-fake-ui-for-media-stream")
            chrome_options.add_argument("--use-fake-device-for-media-stream")
            chrome_options.add_argument("--headless=new") 
            
            # Options to suppress GCM/PHONE_REGISTRATION_ERROR and other noise
            chrome_options.add_argument("--log-level=3") 
            chrome_options.add_experimental_option('excludeSwitches', ['enable-logging', 'enable-automation'])
            chrome_options.add_argument("--disable-notifications")
            chrome_options.add_argument("--disable-background-networking")

            service = Service()
            self.driver = webdriver.Chrome(service=service, options=chrome_options)
            
            print("STT: Starting recognition engine...")
            self.driver.get(self.file_link)
            
            time.sleep(5) 
            
            print("STT: Ready. Listening...")
            
        except Exception as e:
            print(f"CRITICAL STT ERROR: {e}")
            self.driver = None

    def _query_modifier(self, Query):
        query = Query.strip().lower()
        question_words = ["how", "what", "who", "where", "when", "why", "which", "whose", "whom", "can you", "what's", "where's", "how's"]
        
        if any(query.startswith(word) for word in question_words):
            if not query.endswith("?"):
                query += "?"
        else:
            if not query.endswith("."):
                query += "."
                
        return query.capitalize()

    def _universal_translator(self, Text):
        return Text.capitalize()

    def listen(self):
        
        if not self.driver:
            time.sleep(5) 
            return ""

        while True: 
            try:
                text_element = self.driver.find_element(By.ID, "output")
                text = text_element.text.strip() 

                if text:
                    # FIX: Execute JS to clear the text, resolving 'element not interactable'
                    self.driver.execute_script("document.getElementById('output').textContent = '';") 
                    
                    if self.InputLanguage.lower().startswith("en"):
                        return self._query_modifier(text)
                    else:
                        print("STT: Translating...")
                        return self._query_modifier(self._universal_translator(text))
                
                time.sleep(self.POLL_DELAY_SECONDS)

            except Exception as e:
                # Log only if the driver might have crashed
                if "no such" in str(e).lower() or "session" in str(e).lower():
                    print(f"STT Driver Crash Error: {e}")
                time.sleep(5) 
                continue

    def stop(self):
        print("STT: Shutting down Selenium...")
        if self.driver:
            self.driver.execute_script("if (window.recognition) window.recognition.stop();")
            self.driver.quit()
