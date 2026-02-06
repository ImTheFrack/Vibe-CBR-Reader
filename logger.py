import logging
import sys
import os
from logging.handlers import RotatingFileHandler
from config import LOG_LEVEL

def setup_logger(name="vibe", level=LOG_LEVEL):
    """Set up a logger with console and file handlers"""
    logger = logging.getLogger(name)
    
    # If logger already has handlers, don't add more
    if logger.handlers:
        return logger
        
    logger.setLevel(level)
    
    # Formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # File Handler
    log_file = "vibe.log"
    try:
        file_handler = RotatingFileHandler(
            log_file, maxBytes=1024 * 1024 * 5, backupCount=5, encoding='utf-8'
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except Exception as e:
        print(f"Failed to set up file logging: {e}")
        
    return logger

# Create a default logger instance
logger = setup_logger()
