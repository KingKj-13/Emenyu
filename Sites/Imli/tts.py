# tts.py

import pygame 
import random 
import asyncio 
import edge_tts 
import os 
from dotenv import dotenv_values 

# --- FIX: Allows nested asyncio loops needed for synchronous operation ---
import nest_asyncio
nest_asyncio.apply()

DATA_DIR = "Data"
os.makedirs(DATA_DIR, exist_ok=True)

env_vars = dotenv_values(".env")
# Defaults to a voice if the .env file is missing or corrupt
AssistantVoice = env_vars.get("AssistantVoice", "en-US-EricNeural") 

# Asynchronous function to convert text to speech using edge_tts
async def TextToAudioFile(text) -> None:
    file_path = os.path.join(DATA_DIR, 'speech.mp3')
    
    if os.path.exists(file_path): 
        try:
            os.remove(file_path)
        except OSError as e:
            # Handle case where file might be in use
            print(f"Warning: Could not remove old speech file: {e}") 
    
    # Create the communication object to generate speech
    communicate = edge_tts.Communicate(text, AssistantVoice, pitch='+5Hz', rate='+13%')
    await communicate.save(file_path)

# Function to manage Text-To-Speech (TTS) functionality
def TTS(Text, func=lambda r=None: True):
    file_path = os.path.join(DATA_DIR, 'speech.mp3')
    mixer_initialized = False 
    
    try:
        # Convert Text to audio file asynchronously
        asyncio.run(TextToAudioFile(Text))

        # Initialize pygame mixer for audio playback
        pygame.mixer.init() 
        mixer_initialized = True
        
        # Load and play the audio
        pygame.mixer.music.load(file_path) 
        pygame.mixer.music.play() 

        # Loop until the audio playback is finished or the external function stops
        while pygame.mixer.music.get_busy():
            if func() == False: 
                pygame.mixer.music.stop() 
                break
            pygame.time.Clock().tick(10) 

        return True 
    
    except Exception as e:
        print(f"Error in TTS (Main Block): {e}") 
        return False
    
    finally:
        # Safely quit the mixer only if it was initialized
        if mixer_initialized:
            try:
                func(False)
                pygame.mixer.music.stop() 
                pygame.mixer.quit()
            except Exception as e:
                print(f"Error in TTS Cleanup Block: {e}") 

def speak(Text, func=lambda r=None: True):
    """
    Wrapper function called by josh_main.py. Handles text length and console output.
    """
    
    # This prints the AI's response to the console, fulfilling the request.
    print(f"JOSH/TTS: {Text}") 
    
    Data = str(Text).split(".")
    
    # --- CUSTOMER-FOCUSED RESPONSES (FIXED) ---
    # These messages are polite and tell the customer the *important* part, 
    # while the full text appears on the developer's console.
    responses = [
        "That's a lot of detail! I've given you the summary; the complete text is being logged now.",
        "The full description is quite long. I'll summarize; the rest is available in the system log.",
        "Too many details for me to speak clearly! I'll give you the main points; the full text is logged.",
        "That information is extensive. I'll provide the brief details, and the rest will appear in the system output.",
        "I'm keeping my response concise for clarity. The full information is being sent to the log now.",
        "Just the summary for you! The complete description has been sent to the system log.",
        "I need to keep my response brief. Please refer to the system output for all the details.",
        "I've shared the key information. The complete text is available in the background system log."
    ]
    # --- END CUSTOMIZED RESPONSES ---

    # Logic to handle long text
    if len(Data) > 4 and len(Text) >= 250:
        TTS(" ".join(Text.split(".")[0:2])+"." + random.choice(responses), func)
    else:
        TTS(Text, func)